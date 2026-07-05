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
async function canViewStatus(status, viewerId) {
  if (status.user_id === viewerId) return true;
  if (status.privacy === 'everyone') return true;
  if (status.privacy === 'private') return false;

  // Check if viewer is a contact or shares a conversation with the status owner
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('user_id', viewerId)
    .eq('contact_id', status.user_id)
    .maybeSingle();

  // Check if they share a conversation (chat peer)
  const { data: sharedConv } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', viewerId)
    .in('conversation_id',
      (await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', status.user_id)
      ).data?.map(r => r.conversation_id) || []
    )
    .limit(1)
    .maybeSingle();

  const isContact = !!contact;
  const isPeer = !!sharedConv;

  if (status.privacy === 'contacts') return isContact || isPeer;

  const { data: rule } = await supabase
    .from('status_privacy_rules')
    .select('id, rule_type')
    .eq('status_id', status.id)
    .eq('user_id', viewerId)
    .maybeSingle();

  if (status.privacy === 'except') return (isContact || isPeer) && !rule;
  if (status.privacy === 'only') return !!rule;
  return false;
}

// ── GET /api/status/feed ────────────────────────────────────────────────────
router.get('/feed', requireAuth, async (req, res) => {
  try {
    const viewerId = req.user.id;
    const now = new Date().toISOString();

    // Gather peer user IDs (contacts + conversation peers)
    const { data: contacts } = await supabase
      .from('contacts')
      .select('contact_id')
      .eq('user_id', viewerId);

    const { data: myConvs } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', viewerId);

    const convIds = (myConvs || []).map(r => r.conversation_id);
    let peerIds = [];
    if (convIds.length > 0) {
      const { data: peers } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .in('conversation_id', convIds)
        .neq('user_id', viewerId);
      peerIds = (peers || []).map(r => r.user_id);
    }

    const contactIds = (contacts || []).map(r => r.contact_id);
    const userIds = [...new Set([viewerId, ...contactIds, ...peerIds])];

    // Get muted users
    const { data: mutes } = await supabase
      .from('status_mutes')
      .select('muted_user')
      .eq('user_id', viewerId);
    const mutedSet = new Set((mutes || []).map(m => m.muted_user));

    // Fetch all active statuses for those users
    const { data: statuses, error } = await supabase
      .from('statuses')
      .select('*, profiles:user_id (id, username, full_name, avatar_url)')
      .in('user_id', userIds)
      .eq('is_deleted', false)
      .eq('is_archived', false)
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

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
    const grouped = {};
    for (const status of (statuses || [])) {
      if (!await canViewStatus(status, viewerId)) continue;
      const profile = status.profiles || {};
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
      grouped[uid].statuses.push({ ...status, profiles: undefined, has_viewed: hasViewed });
    }

    // Sort: own first, then unviewed, then muted
    const feed = Object.values(grouped).sort((a, b) => {
      if (a.user_id === viewerId) return -1;
      if (b.user_id === viewerId) return 1;
      if (a.is_muted !== b.is_muted) return a.is_muted ? 1 : -1;
      if (a.has_unviewed !== b.has_unviewed) return a.has_unviewed ? -1 : 1;
      return 0;
    });

    res.json(feed);
  } catch (err) {
    logger.error('[Status] Feed error', { error: err.message });
    res.status(500).json({ error: 'Failed to load status feed' });
  }
});

// ── GET /api/status/my ──────────────────────────────────────────────────────
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { data: statuses, error } = await supabase
      .from('statuses')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with viewers and reactions
    const enriched = await Promise.all((statuses || []).map(async (s) => {
      const { data: viewers } = await supabase
        .from('status_views')
        .select('viewed_at, completed, viewer:viewer_id (id, full_name, avatar_url)')
        .eq('status_id', s.id)
        .order('viewed_at', { ascending: false });

      const { data: reactions } = await supabase
        .from('status_reactions')
        .select('emoji, user:user_id (id, full_name, avatar_url)')
        .eq('status_id', s.id);

      const { count } = await supabase
        .from('status_views')
        .select('id', { count: 'exact', head: true })
        .eq('status_id', s.id);

      return {
        ...s,
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
        privacy = 'contacts', privacy_rules = [],
      } = req.body;

      if (type === 'text' && !content?.trim())
        return res.status(400).json({ error: 'Text content required' });
      if (['image','video','audio','gif','document'].includes(type) && !media_url)
        return res.status(400).json({ error: 'media_url required for this status type' });

      const expiresAt = new Date(Date.now() + STATUS_EXPIRY_HOURS * 3600 * 1000).toISOString();

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
          link_url: link_url || null,
          link_title: link_title || null,
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

      // Notify all conversation peers via realtimeService
      const { data: myConvs } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', req.user.id);

      const convIds = (myConvs || []).map(r => r.conversation_id);
      if (convIds.length > 0) {
        const { data: peers } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .in('conversation_id', convIds)
          .neq('user_id', req.user.id);

        const peerIds = [...new Set((peers || []).map(r => r.user_id))];
        for (const peerId of peerIds) {
          realtime.emitToUser(peerId, 'status:new', realtimePayload);
        }
      }

      res.status(201).json(status);
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
    if (status.user_id === req.user.id) return res.json({ success: true });

    const { completed = false } = req.body;

    await supabase.from('status_views').upsert(
      { status_id: status.id, viewer_id: req.user.id, completed, viewed_at: new Date().toISOString() },
      { onConflict: 'status_id,viewer_id' }
    );

    // Sync exact unique view count
    const { count } = await supabase
      .from('status_views')
      .select('id', { count: 'exact', head: true })
      .eq('status_id', status.id);

    await supabase.from('statuses').update({ view_count: count || 0 }).eq('id', status.id);

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
      .from('conversation_participants').select('conversation_id').eq('user_id', req.user.id);
    const myConvIds = (myConvs || []).map(r => r.conversation_id);

    let convId = null;
    if (myConvIds.length > 0) {
      const { data: shared } = await supabase
        .from('conversation_participants')
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
      await supabase.from('conversation_participants').insert([
        { conversation_id: convId, user_id: req.user.id },
        { conversation_id: convId, user_id: status.user_id },
      ]);
    }

    // Send message referencing the status
    const { data: msg } = await supabase
      .from('messages')
      .insert({
        conversation_id: convId,
        sender_id: req.user.id,
        type: 'text',
        content: content || '',
        metadata: { status_ref_id: status.id },
      })
      .select().single();

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
