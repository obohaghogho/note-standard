/**
 * Status (Stories) Route — NoteStandard
 * Mirrors WhatsApp-style 24-hour status updates.
 * Uses Supabase (service role) for data and realtimeService for push events.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/authMiddleware');
const supabase = require('../config/database');
const realtime = require('../services/realtimeService');
const logger = require('../utils/logger');

const STATUS_EXPIRY_HOURS = parseInt(process.env.STATUS_EXPIRY_HOURS || '24');

// ── Privacy helper ──────────────────────────────────────────────────────────
async function canViewStatus(status, viewerId, peerIdsSet = null) {
  if (status.user_id === viewerId) return true;
  if (status.privacy === 'everyone') return true;
  if (status.privacy === 'private') return false;

  let isPeer = false;
  if (peerIdsSet) {
    isPeer = peerIdsSet.has(status.user_id);
  } else {
    // Check if they share a conversation (chat peer)
    const { data: sharedConv } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', viewerId)
      .in('conversation_id',
        (await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', status.user_id)
        ).data?.map(r => r.conversation_id) || []
      )
      .limit(1)
      .maybeSingle();
    isPeer = !!sharedConv;
  }

  if (status.privacy === 'contacts') return isPeer;

  const { data: rule } = await supabase
    .from('status_privacy_rules')
    .select('id, rule_type')
    .eq('status_id', status.id)
    .eq('user_id', viewerId)
    .maybeSingle();

  if (status.privacy === 'except') return isPeer && !rule;
  if (status.privacy === 'only') return !!rule;
  return false;
}

// ── GET /api/status/feed ────────────────────────────────────────────────────
router.get('/feed', requireAuth, async (req, res) => {
  try {
    const viewerId = req.user.id;
    const now = new Date().toISOString();

    // Gather peer user IDs (conversation peers)
    const { data: myConvs } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', viewerId);

    const convIds = (myConvs || []).map(r => r.conversation_id);
    let peerIds = [];
    if (convIds.length > 0) {
      const { data: peers } = await supabase
        .from('conversation_members')
        .select('user_id')
        .in('conversation_id', convIds)
        .neq('user_id', viewerId);
      peerIds = (peers || []).map(r => r.user_id);
    }

    const userIds = [...new Set([viewerId, ...peerIds])];

    // Get muted users
    const { data: mutes } = await supabase
      .from('status_mutes')
      .select('muted_user')
      .eq('user_id', viewerId);
    const mutedSet = new Set((mutes || []).map(m => m.muted_user));

    // Fetch all active statuses for those users
    // NOTE: statuses has no FK to profiles in Supabase schema cache,
    // so we do a manual two-step lookup instead of a join.
    const { data: statuses, error } = await supabase
      .from('statuses')
      .select('*')
      .in('user_id', userIds)
      .eq('is_deleted', false)
      .eq('is_archived', false)
      .gt('expires_at', now)
      .order('created_at', { ascending: true });

    // Batch-fetch profiles for all unique user IDs in the result
    const statusUserIds = [...new Set((statuses || []).map(s => s.user_id))];
    const { data: profilesData } = statusUserIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', statusUserIds)
      : { data: [] };
    const profileMap = {};
    (profilesData || []).forEach(p => { profileMap[p.id] = p; });

    if (error) throw error;

    // Fetch viewer's own views for these statuses
    const statusIds = (statuses || []).map(s => s.id);
    let viewedSet = new Set();
    if (statusIds.length > 0) {
      const { data: views } = await supabase
        .from('status_views')
        .select('status_id')
        .eq('viewer_id', viewerId)
        .in('status_id', statusIds);
      viewedSet = new Set((views || []).map(v => v.status_id));
    }

    // Group by user, apply privacy filter
    const peerIdsSet = new Set(peerIds);
    const grouped = {};
    for (const status of (statuses || [])) {
      if (!await canViewStatus(status, viewerId, peerIdsSet)) continue;
      const profile = profileMap[status.user_id] || {};
      const uid = status.user_id;
      const isMuted = mutedSet.has(uid);
      const hasViewed = viewedSet.has(status.id);

      if (!grouped[uid]) {
        grouped[uid] = {
          user_id: uid,
          username: profile.username,
          display_name: profile.full_name,
          avatar_url: profile.avatar_url,
          statuses: [],
          is_muted: isMuted,
          has_unviewed: false,
        };
      }

      if (!hasViewed && uid !== viewerId) grouped[uid].has_unviewed = true;
      const statusPayload = { ...status, has_viewed: hasViewed };
      if (statusPayload.type !== 'link') {
        statusPayload.bg_music_url = statusPayload.link_url;
        statusPayload.bg_music_title = statusPayload.link_title;
        statusPayload.link_url = null;
        statusPayload.link_title = null;
      }
      grouped[uid].statuses.push(statusPayload);
    }

    // Sort: own first, then unviewed, then muted
    const feed = Object.values(grouped).sort((a, b) => {
      if (a.user_id === viewerId) return -1;
      if (b.user_id === viewerId) return 1;
      if (a.is_muted !== b.is_muted) return a.is_muted ? 1 : -1;
      if (a.has_unviewed !== b.has_unviewed) return a.has_unviewed ? -1 : 1;
      return 0;
    });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(feed);
  } catch (err) {
    logger.error('[Status] Feed error', { error: err.message });
    res.status(500).json({ error: 'Failed to load status feed' });
  }
});

// ── GET /api/status/my ──────────────────────────────────────────────────────
router.get('/my', requireAuth, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data: statuses, error } = await supabase
      .from('statuses')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('is_deleted', false)
      .gt('expires_at', now)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Fetch owner's own views
    const statusIds = (statuses || []).map(s => s.id);
    let viewedSet = new Set();
    if (statusIds.length > 0) {
      const { data: views } = await supabase
        .from('status_views')
        .select('status_id')
        .eq('viewer_id', req.user.id)
        .in('status_id', statusIds);
      viewedSet = new Set((views || []).map(v => v.status_id));
    }

    // Enrich with viewers and reactions
    const enriched = await Promise.all((statuses || []).map(async (s) => {
      const { data: viewers } = await supabase
        .from('status_views')
        .select('viewed_at, completed, viewer:viewer_id (id, full_name, avatar_url)')
        .eq('status_id', s.id)
        .neq('viewer_id', req.user.id)
        .order('viewed_at', { ascending: false });

      const { data: reactions } = await supabase
        .from('status_reactions')
        .select('emoji, user:user_id (id, full_name, avatar_url)')
        .eq('status_id', s.id);

      const { count } = await supabase
        .from('status_views')
        .select('id', { count: 'exact', head: true })
        .eq('status_id', s.id)
        .neq('viewer_id', req.user.id);

      const enrichedStatus = {
        ...s,
        has_viewed: viewedSet.has(s.id),
        view_count: count || 0,
        viewers: (viewers || []).map(v => ({
          id: v.viewer?.id,
          display_name: v.viewer?.full_name,
          avatar_url: v.viewer?.avatar_url,
          viewed_at: v.viewed_at,
          completed: v.completed,
        })),
        reactions: (reactions || []).map(r => ({
          id: r.user?.id,
          display_name: r.user?.full_name,
          avatar_url: r.user?.avatar_url,
          emoji: r.emoji,
        })),
      };

      if (enrichedStatus.type !== 'link') {
        enrichedStatus.bg_music_url = enrichedStatus.link_url;
        enrichedStatus.bg_music_title = enrichedStatus.link_title;
        enrichedStatus.link_url = null;
        enrichedStatus.link_title = null;
      }

      return enrichedStatus;
    }));

    res.json(enriched);
  } catch (err) {
    logger.error('[Status] My statuses error', { error: err.message });
    res.status(500).json({ error: 'Failed to load statuses' });
  }
});

// ── POST /api/status — create ───────────────────────────────────────────────
router.post('/',
  requireAuth,
  body('type').isIn(['text','image','video','audio','gif','link','document']),
  body('privacy').optional().isIn(['everyone','contacts','except','only','private']),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const {
        type, content, media_url, media_thumbnail, media_size, media_duration,
        bg_color, bg_gradient, font_style, font_size, text_align,
        link_url, link_title, link_description, link_image,
        bg_music_url, bg_music_title,
        privacy = 'contacts', privacy_rules = [],
      } = req.body;

      if (type === 'text' && !content?.trim())
        return res.status(400).json({ error: 'Text content required' });
      if (['image','video','audio','gif','document'].includes(type) && !media_url)
        return res.status(400).json({ error: 'media_url required for this status type' });

      const expiresAt = new Date(Date.now() + STATUS_EXPIRY_HOURS * 3600 * 1000).toISOString();

      const finalLinkUrl = type !== 'link' ? (bg_music_url || null) : (link_url || null);
      const finalLinkTitle = type !== 'link' ? (bg_music_title || null) : (link_title || null);

      const { data: status, error } = await supabase
        .from('statuses')
        .insert({
          user_id: req.user.id,
          type, content: content || null,
          media_url: media_url || null,
          media_thumbnail: media_thumbnail || null,
          media_size: media_size || null,
          media_duration: media_duration || null,
          bg_color: bg_color || '#1a1a2e',
          bg_gradient: bg_gradient || null,
          font_style: font_style || 'inter',
          font_size: font_size || 24,
          text_align: text_align || 'center',
          link_url: finalLinkUrl,
          link_title: finalLinkTitle,
          link_description: link_description || null,
          link_image: link_image || null,
          privacy,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) throw error;

      // Privacy rules
      if (privacy_rules.length > 0 && ['except','only'].includes(privacy)) {
        await supabase.from('status_privacy_rules').insert(
          privacy_rules.map(uid => ({ status_id: status.id, user_id: uid, rule_type: privacy }))
        );
      }

      // Fetch author profile for realtime payload
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('id', req.user.id)
        .single();

      const realtimePayload = {
        ...status,
        username: profile?.username,
        display_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
      };

      if (realtimePayload.type !== 'link') {
        realtimePayload.bg_music_url = realtimePayload.link_url;
        realtimePayload.bg_music_title = realtimePayload.link_title;
        realtimePayload.link_url = null;
        realtimePayload.link_title = null;
      }

      // Notify all conversation peers via realtimeService
      const { data: myConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', req.user.id);

      const convIds = (myConvs || []).map(r => r.conversation_id);
      if (convIds.length > 0) {
        const { data: peers } = await supabase
          .from('conversation_members')
          .select('user_id')
          .in('conversation_id', convIds)
          .neq('user_id', req.user.id);

        const peerIds = [...new Set((peers || []).map(r => r.user_id))];
        for (const peerId of peerIds) {
          realtime.emitToUser(peerId, 'status:new', realtimePayload);
        }
      }

      const clientStatus = { ...status };
      if (clientStatus.type !== 'link') {
        clientStatus.bg_music_url = clientStatus.link_url;
        clientStatus.bg_music_title = clientStatus.link_title;
        clientStatus.link_url = null;
        clientStatus.link_title = null;
      }

      res.status(201).json(clientStatus);
    } catch (err) {
      logger.error('[Status] Create error', { error: err.message });
      res.status(500).json({ error: 'Failed to create status' });
    }
  }
);

// ── POST /api/status/:id/view ───────────────────────────────────────────────
router.post('/:id/view', requireAuth, async (req, res) => {
  try {
    const { data: status, error } = await supabase
      .from('statuses')
      .select('*')
      .eq('id', req.params.id)
      .eq('is_deleted', false)
      .single();

    if (error || !status) return res.status(404).json({ error: 'Not found' });
    if (!await canViewStatus(status, req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    const isOwner = status.user_id === req.user.id;
    const { completed = false } = req.body;

    await supabase.from('status_views').upsert(
      { status_id: status.id, viewer_id: req.user.id, completed, viewed_at: new Date().toISOString() },
      { onConflict: 'status_id,viewer_id' }
    );

    // Sync exact unique view count (excluding owner's self-views)
    const { count } = await supabase
      .from('status_views')
      .select('id', { count: 'exact', head: true })
      .eq('status_id', status.id)
      .neq('viewer_id', status.user_id);

    await supabase.from('statuses').update({ view_count: count || 0 }).eq('id', status.id);

    if (!isOwner) {
      // Notify owner
      const { data: viewer } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', req.user.id)
        .single();

      realtime.emitToUser(status.user_id, 'status:viewed', {
        status_id: status.id,
        view_count: count || 0,
        viewer: { id: viewer?.id, display_name: viewer?.full_name, avatar_url: viewer?.avatar_url },
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[Status] View error', { error: err.message });
    res.status(500).json({ error: 'Failed to record view' });
  }
});

// ── POST /api/status/:id/react ──────────────────────────────────────────────
router.post('/:id/react', requireAuth, async (req, res) => {
  try {
    const { emoji } = req.body;
    const { data: status } = await supabase
      .from('statuses').select('*').eq('id', req.params.id).eq('is_deleted', false).single();
    if (!status) return res.status(404).json({ error: 'Not found' });
    if (!await canViewStatus(status, req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    if (!emoji) {
      await supabase.from('status_reactions').delete()
        .eq('status_id', status.id).eq('user_id', req.user.id);
    } else {
      await supabase.from('status_reactions').upsert(
        { status_id: status.id, user_id: req.user.id, emoji },
        { onConflict: 'status_id,user_id' }
      );
    }

    const { data: reactor } = await supabase
      .from('profiles').select('id, full_name, avatar_url').eq('id', req.user.id).single();

    realtime.emitToUser(status.user_id, 'status:reaction', {
      status_id: status.id,
      reactor: { id: reactor?.id, display_name: reactor?.full_name, avatar_url: reactor?.avatar_url },
      emoji,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('[Status] React error', { error: err.message });
    res.status(500).json({ error: 'Failed to react' });
  }
});

// ── POST /api/status/:id/reply ──────────────────────────────────────────────
router.post('/:id/reply', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    const { data: status } = await supabase
      .from('statuses').select('*').eq('id', req.params.id).eq('is_deleted', false).single();
    if (!status) return res.status(404).json({ error: 'Not found' });

    // Find or create direct conversation
    const { data: myConvs } = await supabase
      .from('conversation_members').select('conversation_id').eq('user_id', req.user.id);
    const myConvIds = (myConvs || []).map(r => r.conversation_id);

    let convId = null;
    if (myConvIds.length > 0) {
      const { data: shared } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .in('conversation_id', myConvIds)
        .eq('user_id', status.user_id)
        .limit(1).maybeSingle();
      convId = shared?.conversation_id || null;
    }

    if (!convId) {
      const { data: newConv } = await supabase
        .from('conversations').insert({ type: 'direct', created_by: req.user.id }).select('id').single();
      convId = newConv.id;
      await supabase.from('conversation_members').insert([
        { conversation_id: convId, user_id: req.user.id },
        { conversation_id: convId, user_id: status.user_id },
      ]);
    }

    // Send message referencing the status
    const { data: msg, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: convId,
        sender_id: req.user.id,
        type: 'text',
        content: content || '',
        metadata: { status_ref_id: status.id },
      })
      .select().single();

    if (msgError) throw msgError;

    // Stamp authoritative last-message pointer on the conversation to update chatlist preview and ordering
    await supabase
      .from('conversations')
      .update({
        last_message_id: msg.id,
        last_message_at: msg.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', convId);

    // Hydrate message with sender profile details needed by the chat client
    const { data: hydratedMessage } = await supabase
      .from('messages')
      .select('*, sender:profiles(id, username, full_name, avatar_url)')
      .eq('id', msg.id)
      .single();

    // Broadcast the new message via real-time sockets to both participants
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', convId);

    if (members && members.length > 0) {
      const userIds = members.map(m => m.user_id);
      await realtime.emitToUsers(userIds, 'chat:message', hydratedMessage || msg);
    }

    res.status(201).json({ success: true, conversation_id: convId, message_id: msg?.id });
  } catch (err) {
    logger.error('[Status] Reply error', { error: err.message });
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// ── DELETE /api/status/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { data: status } = await supabase
      .from('statuses').select('id, user_id').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!status) return res.status(404).json({ error: 'Not found or not owner' });

    await supabase.from('statuses').update({ is_deleted: true }).eq('id', status.id);

    realtime.emitToUser(req.user.id, 'status:deleted', { status_id: status.id, user_id: req.user.id });

    res.json({ success: true });
  } catch (err) {
    logger.error('[Status] Delete error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete status' });
  }
});

// ── PATCH /api/status/:id ───────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { privacy, is_archived } = req.body;
    const updates = {};
    if (privacy) updates.privacy = privacy;
    if (is_archived !== undefined) updates.is_archived = is_archived;
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase.from('statuses').update(updates)
      .eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    logger.error('[Status] Patch error', { error: err.message });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ── POST /api/status/mute/:userId ───────────────────────────────────────────
router.post('/mute/:userId', requireAuth, async (req, res) => {
  try {
    await supabase.from('status_mutes')
      .upsert({ user_id: req.user.id, muted_user: req.params.userId }, { onConflict: 'user_id,muted_user' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mute' });
  }
});

// ── DELETE /api/status/mute/:userId ─────────────────────────────────────────
router.delete('/mute/:userId', requireAuth, async (req, res) => {
  try {
    await supabase.from('status_mutes')
      .delete().eq('user_id', req.user.id).eq('muted_user', req.params.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unmute' });
  }
});

module.exports = router;
