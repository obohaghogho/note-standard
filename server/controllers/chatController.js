const supabase = require("../config/database");
const usernameCache = new Map(); // Cache to prevent blocking DB lookups during push dispatch
// ── FIX 2a: Sender profile cache — stores {id,username,full_name,avatar_url} per userId.
// Avoids a DB SELECT for sender profile when reconstructing the sendMessage response payload.
const senderProfileCache = new Map();

const { createNotification, dispatchFastPush } = require("../services/notificationService");
const { detectLanguage } = require("../services/translationService");
const realtime = require("../services/realtimeService");
const features = require("../config/features");
const { normalizeOutboundMessage } = require("../utils/payloadNormalizer");
const replayGuard = require("../utils/replayGuard");
const crypto = require("crypto");
const { emitMessageEvent } = require("../rpc/eventLedger");
const logger = require("../utils/logger");
const PIPELINE_VERSION = process.env.MESSAGING_PIPELINE_VERSION || 'v2';

// ── FIX 3: Module-level Sentiment instance — instantiated ONCE, reused forever.
// Previously: `new Sentiment()` was called inside the handler on every message send.
const Sentiment = require("sentiment");
const _sentimentAnalyzer = new Sentiment();

// ── FIX 4: Auto-reply settings TTL cache — avoids a DB SELECT on every message.
// Settings rarely change; we refresh at most once per minute.
let _autoReplyCache = null;
let _autoReplyCacheTs = 0;
const AUTO_REPLY_CACHE_TTL_MS = 60_000; // 60 seconds
async function _getAutoReplySettings() {
    const now = Date.now();
    if (_autoReplyCache !== null && (now - _autoReplyCacheTs) < AUTO_REPLY_CACHE_TTL_MS) {
        return _autoReplyCache;
    }
    try {
        const { data } = await supabase.from("auto_reply_settings").select("*").single();
        _autoReplyCache = data || null;
        _autoReplyCacheTs = now;
    } catch (e) {
        _autoReplyCache = null;
    }
    return _autoReplyCache;
}

/**
 * _hydrateReplyTo — batch-resolve reply_to nested objects in place.
 *
 * Called by getMessages fallback paths when the Supabase FK join fails
 * (e.g. migration 199 not yet applied, schema cache stale, or PostgREST
 * version doesn't support the self-referencing join syntax).
 *
 * Performs a SINGLE IN-query for all unique reply_to_id values found in
 * the message array, then mutates each message in place with the
 * resolved { id, content, sender_id, message_type, deleted } object.
 *
 * @param {Array<Object>} messages - mutable array of message rows
 */
// ── FIX 5: _mapSenderTypeBatch — `currentUserId` was undefined (bug).
// The function now accepts an optional `requestUserId` parameter so callers
// can pass `req.user.id` when available. Falls back to 'unknown' safely.
async function _mapSenderTypeBatch(messages, requestUserId) {
    if (!messages || messages.length === 0) return;
    try {
        const convIds = [...new Set(messages.map(m => m.conversation_id))];
        const { data: convs } = await supabase.from('conversations').select('id, chat_type').in('id', convIds);
        const supportConvIds = new Set((convs || []).filter(c => c.chat_type === 'support').map(c => c.id));
        const SUPPORT_BOT_ID = '00000000-0000-0000-0000-000000000000';
        
        for (const msg of messages) {
            if (supportConvIds.has(msg.conversation_id)) {
                if (msg.sender_id === SUPPORT_BOT_ID) {
                    msg.sender_type = 'ai';
                } else if (requestUserId && msg.sender_id === requestUserId) {
                    msg.sender_type = 'user';
                } else {
                    msg.sender_type = 'human';
                }
            } else {
                msg.sender_type = 'user';
            }
        }
    } catch (e) {
        console.warn('[Chat Controller] Error mapping sender type batch:', e.message);
    }
}
async function _hydrateReplyTo(messages) {
  if (!messages || messages.length === 0) return;
  const ids = [...new Set(
    messages.filter(m => m.reply_to_id && !m.reply_to).map(m => m.reply_to_id)
  )];
  if (ids.length === 0) return;
  try {
    const { data: parents } = await supabase
      .from('messages')
      .select('id, content, sender_id, type, is_deleted, sender:profiles(username, full_name)')
      .in('id', ids);
    if (!parents) return;
    const map = Object.fromEntries(parents.map(p => [p.id, p]));
    messages.forEach(m => {
      // If the message already has a fully formed reply_to object, DO NOT overwrite it.
      // But if it's missing (and it has a reply_to_id), populate it from our map.
      if (!m.reply_to_id || m.reply_to) return;
      
      const p = map[m.reply_to_id];
      const senderName = p && p.sender ? (p.sender.full_name || p.sender.username) : null;
      m.reply_to = p
        ? { id: p.id, content: p.content, sender_id: p.sender_id, type: p.type, deleted: p.is_deleted, sender_name: senderName }
        : { id: m.reply_to_id, content: '', sender_id: '', deleted: true };
    });
  } catch (e) {
    console.warn('[Chat Controller] _hydrateReplyTo batch failed:', e.message);
  }
}

function getNotificationPreview(type, content) {
  switch (type) {
    case 'audio':
    case 'voice':
      return '🎤 Voice message';
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'document':
    case 'file':
      return '📄 Document';
    case 'call':
    case 'call_incoming':
      return '📞 Missed call';
    default:
      return content;
  }
}

function deduplicateDirectConversations(conversations, currentUserId) {
  if (!Array.isArray(conversations) || conversations.length === 0) return conversations;

  const seenDirectPeerIds = new Set();
  const result = [];

  const sorted = [...conversations].sort((a, b) => {
    // Prefer conversations with messages over empty ones
    const hasMsgA = a.last_message ? 1 : 0;
    const hasMsgB = b.last_message ? 1 : 0;
    if (hasMsgA !== hasMsgB) return hasMsgB - hasMsgA;

    const timeA = new Date(a.last_message_at || a.last_message?.created_at || a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.last_message_at || b.last_message?.created_at || b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  for (const conv of sorted) {
    if (conv.type === "direct") {
      const members = conv.members || [];
      const otherMember = members.find(m => (m.user_id || m.profile?.id) !== currentUserId);
      const peerId = otherMember?.user_id || otherMember?.profile?.id;

      if (peerId) {
        if (seenDirectPeerIds.has(peerId)) {
          continue;
        }
        seenDirectPeerIds.add(peerId);
      }
    }
    result.push(conv);
  }

  return result;
}

// --- Conversations ---

exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    // ─── FAST PATH: rpc_get_conversations ─────────────────────────────────────
    // Single SQL function replacing 61+ serial queries.
    // Falls back to N+1 only if migration 207 is not yet deployed.
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const t0 = Date.now();
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('rpc_get_conversations', { p_user_id: userId });

      if (rpcError) {
        // PGRST202 = function does not exist yet (migration pending)
        if (rpcError.code === 'PGRST202' || (rpcError.message && rpcError.message.includes('rpc_get_conversations'))) {
          console.warn('[Chat] rpc_get_conversations not available — using N+1 fallback');
          throw new Error('RPC_NOT_FOUND');
        }
        throw rpcError;
      }

      let conversations = Array.isArray(rpcData) ? rpcData : [];
      
      // Filter out support chats AND per-user deleted conversations
      conversations = conversations.filter(c => {
        if (c.chat_type === "support" || c.name === "Support Chat") return false;
        if (c.membership?.is_deleted) return false;

        // If user cleared history, mask last_message and unreadCount if last_message is prior to cleared_at
        if (c.membership?.cleared_at) {
          const clearedAt = new Date(c.membership.cleared_at).getTime();
          const lastMsgAt = new Date(c.last_message?.created_at || c.updated_at || c.created_at || 0).getTime();
          if (lastMsgAt <= clearedAt) {
            c.last_message = null;
            c.lastMessage = null;
            c.unreadCount = 0;
            c.unread_count = 0;
          }
        }
        return true;
      });

      // Deduplicate direct conversations by peer user ID
      conversations = deduplicateDirectConversations(conversations, userId);

      // Background Delivery Sync: Mark any unread conversations as delivered automatically.
      const convsWithUnread = conversations.filter(c => c.unreadCount > 0 || c.unread_count > 0);
      if (convsWithUnread.length > 0) {
        const unreadConvIds = convsWithUnread.map(c => c.id);
        supabase.from('messages')
          .update({ delivered_at: new Date().toISOString() })
          .in('conversation_id', unreadConvIds)
          .neq('sender_id', userId)
          .is('delivered_at', null)
          .then(({ error }) => {
            if (error) console.error('[Chat] Background delivery sync failed:', error.message);
          });
      }

      console.log(`[Chat RPC] getConversations: ${conversations.length} convs in ${Date.now() - t0}ms`);
      return res.json(conversations);
    } catch (rpcErr) {
      if (rpcErr.message !== 'RPC_NOT_FOUND') {
        console.error('[Chat] rpc_get_conversations failed, using N+1 fallback:', rpcErr.message);
      }
    }

    // ─── FALLBACK: N+1 path (preserved for backward compat) ──────────────────
    // 1. Fetch memberships
    let memberships = [];
    try {
      const { data: mData, error: mError } = await supabase
        .from("conversation_members")
        .select("conversation_id, role, status, cleared_at, is_deleted, deleted_at")
        .eq("user_id", userId);
      if (mError) throw mError;
      memberships = mData || [];
    } catch (e) {
      return res.status(500).json({ error: "Failed to load chat memberships", details: e.message });
    }

    if (memberships.length === 0) return res.json([]);

    const conversationIds = memberships.map(m => m.conversation_id);

    // 2. Fetch conversations in batch (excluding support chats)
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", conversationIds)
      .neq("chat_type", "support")
      .neq("name", "Support Chat");

    if (convError) return res.status(500).json({ error: "Failed to load conversation details" });

    // Fetch blocks once for the whole batch
    let userBlocks = [];
    try {
      const { data: blocks } = await supabase
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
      userBlocks = blocks || [];
    } catch (e) { /* non-fatal */ }

    // 3. Enrich: N+1 per conversation (only used when RPC unavailable)
    const enriched = await Promise.all(conversations.map(async (conv) => {
      try {
        const membership = memberships.find(m => m.conversation_id === conv.id);

        const { data: members } = await supabase
          .from("conversation_members")
          .select(`user_id, role, status, profile:profiles (
            id, username, full_name, avatar_url, is_verified,
            plan_tier, is_online, show_online_status, last_seen
          )`)
          .eq("conversation_id", conv.id);

        const { data: lastMsgs } = await supabase
          .from("messages")
          .select("id, content, sender_id, created_at, type, read_at, delivered_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1);

        let unreadCount = 0;
        try {
          const { count } = await supabase
            .from("messages")
            .select("*", { count: 'exact', head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_id", userId)
            .is("read_at", null);
          unreadCount = count || 0;
        } catch (e) { /* non-fatal */ }

        let isBlocked = false, blockedByMe = false, blockedByThem = false;
        if (conv.type === "direct") {
          const otherMember = (members || []).find(m => m.user_id !== userId);
          if (otherMember) {
            const otherId = otherMember.user_id;
            const blockRelation = userBlocks.find(b =>
              (b.blocker_id === userId && b.blocked_id === otherId) ||
              (b.blocker_id === otherId && b.blocked_id === userId)
            );
            if (blockRelation) {
              isBlocked = true;
              blockedByMe = blockRelation.blocker_id === userId;
              blockedByThem = blockRelation.blocker_id === otherId;
            }
          }
        }

        return {
          ...conv,
          unreadCount,
          membership: {
            role: membership?.role || "member",
            status: membership?.status || "accepted",
            cleared_at: membership?.cleared_at || null,
            is_deleted: membership?.is_deleted || false,
            deleted_at: membership?.deleted_at || null,
            joined_at: null
          },
          members: members || [],
          last_message: lastMsgs?.[0] || null,
          isBlocked,
          blockedByMe,
          blockedByThem
        };
      } catch (e) {
        console.error(`[Chat] Enrichment failed for conv ${conv.id}:`, e.message);
        return { ...conv, members: [], last_message: null, unreadCount: 0 };
      }
    }));

    const sorted = enriched
      .filter(c => c.chat_type !== "support" && c.name !== "Support Chat" &&
        !(c.name && c.name.toLowerCase().includes("support team")))
      // CHATLIST FIX: Sort by authoritative last_message_at pointer instead of
      // messages.created_at — immune to clock drift and delayed inserts.
      .sort((a, b) =>
        new Date(b.last_message_at || b.last_message?.created_at || b.updated_at || b.created_at) -
        new Date(a.last_message_at || a.last_message?.created_at || a.updated_at || a.created_at)
      );

    // Filter out per-user deleted conversations, and mask cleared conversations
    // (aligned with RPC path behavior at lines 159-174)
    const visible = sorted.filter(c => {
      // Per-user deletion: completely remove from list
      if (c.membership?.is_deleted) return false;

      // Clear History: mask last_message but KEEP the conversation in the list
      if (c.type === "direct" && c.membership?.cleared_at) {
        const clearedAt = new Date(c.membership.cleared_at).getTime();
        const lastMsgAt = new Date(c.last_message_at || c.last_message?.created_at || 0).getTime();
        if (lastMsgAt <= clearedAt) {
          c.last_message = null;
          c.lastMessage = null;
          c.unreadCount = 0;
          c.unread_count = 0;
        }
      }
      return true;
    });

    // Deduplicate direct conversations by peer user ID
    const deduplicated = deduplicateDirectConversations(visible, userId);

    res.json(deduplicated);
  } catch (err) {
    console.error("[Chat] getConversations Critical Error:", err.message, err.stack);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

// ── Reconnect Sync Endpoint ────────────────────────────────────────────────
// GET /chat/messages/sync?since=<ISO timestamp>&conversationId=<id>
// Called by the client on socket reconnect to catch any messages missed during
// a network drop. Returns all non-deleted messages after `since`, scoped to
// the caller's conversations (or a specific conversation if provided).
exports.syncMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { since, conversationId } = req.query;

    if (!since) {
      return res.status(400).json({ error: "'since' query param is required (ISO timestamp)" });
    }

    // Load membership cleared_at timestamps for user
    const clearedMap = new Map();
    let memQuery = supabase
      .from("conversation_members")
      .select("conversation_id, cleared_at")
      .eq("user_id", userId);

    if (conversationId) {
      memQuery = memQuery.eq("conversation_id", conversationId);
    }
    const { data: memberships, error: memErr } = await memQuery;
    if (memErr) throw memErr;
    if (conversationId && (!memberships || memberships.length === 0)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const convIds = (memberships || []).map(m => {
      if (m.cleared_at) clearedMap.set(m.conversation_id, new Date(m.cleared_at).getTime());
      return m.conversation_id;
    });

    if (convIds.length === 0) return res.json([]);

    const filterClearedSync = (list) => {
      return (list || []).filter(m => {
        const clearedTime = clearedMap.get(m.conversation_id);
        if (!clearedTime) return true;
        return new Date(m.created_at).getTime() > clearedTime;
      });
    };

    let query = supabase
      .from("messages")
      .select("*, attachment:media_attachments(*), sender:profiles(id, username, full_name, avatar_url)")
      .eq("is_deleted", false)
      .gte("created_at", since)
      .in("conversation_id", convIds)
      .order("created_at", { ascending: true })
      .limit(200);

    const { data, error } = await query;
    if (error) {
      // Fallback: plain select without joins
      const { data: plain, error: plainErr } = await supabase
        .from("messages")
        .select("*")
        .eq("is_deleted", false)
        .gte("created_at", since)
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true })
        .limit(200);
      if (plainErr) throw plainErr;
      const filteredPlain = filterClearedSync(plain || []);
      await _mapSenderTypeBatch(filteredPlain, userId);
      return res.json(filteredPlain);
    }

    const filteredData = filterClearedSync(data || []);
    await _mapSenderTypeBatch(filteredData, userId);
    res.json(filteredData);
  } catch (err) {
    console.error("[Chat] syncMessages error:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.getConversationById = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify user is a member of this conversation
    const { data: membership, error: memError } = await supabase
      .from("conversation_members")
      .select("role, status, cleared_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (memError || !membership) {
      return res.status(403).json({ error: "Access denied or conversation not found" });
    }

    // Fetch conversation details
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Fetch members and profiles
    const { data: members, error: membersError } = await supabase
      .from("conversation_members")
      .select(`
        user_id,
        role,
        status,
        profile:profiles (
          id,
          username,
          full_name,
          avatar_url,
          is_verified,
          plan_tier,
          is_online,
          show_online_status,
          last_seen
        )
      `)
      .eq("conversation_id", conversationId);

    res.json({
      ...conv,
      members: members || [],
      membership: {
        role: membership.role || "member",
        status: membership.status || "accepted",
        cleared_at: membership.cleared_at || null,
        joined_at: null
      }
    });

  } catch (err) {
    console.error("[Chat] getConversationById error:", err.message);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
};

exports.createConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, name, participants: recipientUsernames } = req.body;

    console.log(`[Chat] createConversation request from ${userId} for participants:`, recipientUsernames);

    if (!recipientUsernames || recipientUsernames.length === 0) {
      return res.status(400).json({ error: "Participants (usernames) required" });
    }

    // 0. Ensure sender profile exists in public.profiles (self-healing)
    const { ensureProfile } = require("../services/userService");
    try {
      await ensureProfile(userId, req.user);
    } catch (profileErr) {
      console.warn(`[Chat] ensureProfile warning for sender ${userId}:`, profileErr.message);
    }

    // 1. Resolve Usernames/IDs/Emails to Profile Records (with self-healing for new users)
    const cleanIdentifiers = recipientUsernames.map(u => String(u).trim().replace(/^@/, ''));
    let finalProfiles = [];

    for (const identifier of cleanIdentifiers) {
      if (!identifier) continue;

      // Check if identifier is a valid UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

      let p = null;
      if (isUUID) {
        const { data } = await supabase.from("profiles").select("id, username").eq("id", identifier).maybeSingle();
        p = data;

        // Self-healing: If identifier is a valid UUID but profile missing, trigger ensureProfile
        if (!p) {
          try {
            p = await ensureProfile(identifier);
          } catch (e) { /* non-fatal */ }
        }
      }

      if (!p) {
        const { data } = await supabase.from("profiles").select("id, username").ilike("username", identifier).limit(1);
        p = data?.[0] || null;
      }

      if (!p) {
        const { data } = await supabase.from("profiles").select("id, username").ilike("email", identifier).limit(1);
        p = data?.[0] || null;
      }

      if (!p) {
        const { data } = await supabase.from("profiles").select("id, username").ilike("full_name", identifier).limit(1);
        p = data?.[0] || null;
      }

      // Fallback self-healing: If user registered in auth.users but profile missing in public.profiles
      if (!p) {
        try {
          const { data: authUsers } = await supabase.auth.admin.listUsers();
          if (authUsers?.users) {
            const foundUser = authUsers.users.find(u => 
              u.id === identifier || 
              (u.email && u.email.toLowerCase() === identifier.toLowerCase()) ||
              (u.user_metadata?.username && String(u.user_metadata.username).toLowerCase() === identifier.toLowerCase())
            );
            if (foundUser) {
              p = await ensureProfile(foundUser.id, foundUser);
            }
          }
        } catch (adminErr) {
          console.warn(`[Chat] Could not lookup auth user for identifier ${identifier}:`, adminErr.message);
        }
      }

      if (p && !finalProfiles.some(existing => existing.id === p.id)) {
        finalProfiles.push(p);
      }
    }

    if (finalProfiles.length === 0) {
      return res.status(404).json({ error: "No valid participants found" });
    }

    const participantIds = [...new Set(finalProfiles.map((p) => p.id).filter(id => id !== userId))];

    if (type === "direct" && participantIds.length === 0) {
      return res.status(400).json({ error: "You cannot start a direct chat with yourself." });
    }

    if (type === "group" && participantIds.length === 0) {
      return res.status(400).json({ error: "Group chats require at least one other participant." });
    }

    // 2. Check for existing direct conversation
    if (type === "direct" && participantIds.length === 1) {
      const recipientId = participantIds[0];

      // Find conversations the current user is in
      const { data: myMemberships } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", userId);

      if (myMemberships && myMemberships.length > 0) {
        const convIds = myMemberships.map(m => m.conversation_id);
        
        // Find if the recipient is in any of those same conversations
        const { data: commonMemberships } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .in("conversation_id", convIds)
          .eq("user_id", recipientId);

        if (commonMemberships && commonMemberships.length > 0) {
          // Check if any of these common conversations are 'direct' (and NOT support chats)
          const finalConvIds = commonMemberships.map(m => m.conversation_id);
          const { data: existingConvs } = await supabase
            .from("conversations")
            .select("id, type, updated_at, chat_type, name")
            .in("id", finalConvIds)
            .eq("type", "direct")
            .or("chat_type.is.null,chat_type.neq.support")
            .order("updated_at", { ascending: false });

          if (existingConvs && existingConvs.length > 0) {
            const existingId = existingConvs[0].id;
            
            const { data: conv } = await supabase
              .from("conversations")
              .select("*")
              .eq("id", existingId)
              .maybeSingle();

            if (conv) {
              // Fetch members
              const { data: members } = await supabase
                .from("conversation_members")
                .select(`
                  user_id, role, status, is_deleted, deleted_at, cleared_at,
                  profile:profiles (id, username, full_name, avatar_url, is_verified)
                `)
                .eq("conversation_id", existingId);

              const memberList = members || [];

              // Re-open the conversation for members IF it was soft-deleted.
              // CRITICAL: DO NOT clear cleared_at watermark. cleared_at establishes a durable per-user history boundary.
              await supabase
                .from("conversation_members")
                .update({ 
                  is_deleted: false, 
                  deleted_at: null
                })
                .eq("conversation_id", existingId)
                .in("user_id", [userId, recipientId]);

              const myMembership = memberList.find(m => m.user_id === userId);
              if (myMembership) {
                myMembership.is_deleted = false;
                myMembership.deleted_at = null;
              }

              // Auto-accept if the initiator's current status is pending
              if (myMembership && myMembership.status === 'pending') {
                await supabase
                  .from("conversation_members")
                  .update({ status: 'accepted' })
                  .eq("conversation_id", existingId)
                  .eq("user_id", userId);
                
                myMembership.status = 'accepted';

                // Notify the other user B
                try {
                  const otherMember = memberList.find(m => m.user_id !== userId);
                  if (otherMember) {
                    const { data: accepter } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
                    await createNotification({
                      receiverId: otherMember.user_id,
                      senderId: userId,
                      type: "chat_accepted",
                      title: "Chat Request Accepted",
                      message: `${accepter?.username || "Someone"} accepted your chat request!`,
                      link: `/dashboard/chat?id=${existingId}`,
                    });
                    await realtime.emitToUser(otherMember.user_id, "chat:conversation_updated", {
                      conversationId: existingId,
                      userId,
                      status: "accepted"
                    });
                  }
                } catch (e) {
                  console.warn("[Chat] Accept notification/socket failed in createConversation fallback:", e.message);
                }
              }

              return res.json({
                conversation: { ...conv, members: memberList },
                isExisting: true
              });
            }
          }
        }
      }
    }

    // 3. Create New Conversation
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .insert([{ type: type || 'direct', name: name || null, chat_type: 'user' }])
      .select()
      .single();

    if (convError) {
      console.error("[Chat] Error creating conversation entry:", convError.message);
      throw convError;
    }

    const conversationId = convData.id;

    // 4. Add Members (Ensure profiles exist for all participant IDs to prevent FK constraint failure)
    try {
      await ensureProfile(userId, req.user);
    } catch (e) { /* non-fatal */ }

    for (const pId of participantIds) {
      try {
        await ensureProfile(pId);
      } catch (e) { /* non-fatal */ }
    }

    const membersPayload = [
      {
        conversation_id: conversationId,
        user_id: userId,
        role: "admin",
        status: "accepted",
      },
      ...participantIds.map((pId) => ({
        conversation_id: conversationId,
        user_id: pId,
        role: "member",
        status: "pending",
      })),
    ];

    let { error: memberError } = await supabase
      .from("conversation_members")
      .insert(membersPayload);

    if (memberError) {
      console.warn("[Chat] Initial members insert warning, retrying individually:", memberError.message);
      let anyInserted = false;
      for (const mPayload of membersPayload) {
        const { error: singleErr } = await supabase
          .from("conversation_members")
          .insert([mPayload]);
        if (!singleErr) {
          anyInserted = true;
        } else {
          console.warn(`[Chat] Individual member insert error for user ${mPayload.user_id}:`, singleErr.message);
        }
      }
      if (anyInserted) {
        memberError = null;
      }
    }

    if (memberError) {
      console.error("[Chat] Fatal Error adding members:", memberError.message);
      await supabase.from("conversations").delete().eq("id", conversationId);
      throw memberError;
    }

    // 5. Return complete conversation object
    const { data: finalMembers } = await supabase
      .from("conversation_members")
      .select(`
        user_id, role, status,
        profile:profiles (id, username, full_name, avatar_url, is_verified)
      `)
      .eq("conversation_id", conversationId);

    const result = {
      conversation: { ...convData, members: finalMembers || [] },
      isExisting: false
    };

    // Notify participants via Gateway and Database
    try {
      const { data: creator } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
      
      await realtime.emitToUser(userId, "chat:new_conversation", result.conversation);
      
      for (const pId of participantIds) {
        const notifTitle = "New Chat Request";
        const notifMsg = `${creator?.username || "Someone"} wants to start a chat with you`;
        await createNotification({
          receiverId: pId,
          senderId: userId,
          type: "chat_request",
          title: notifTitle,
          message: notifMsg,
          link: `/dashboard/chat?id=${conversationId}`,
          conversationId: conversationId,
        });
        await dispatchFastPush({
          receiverId: pId,
          type: "chat_request",
          title: notifTitle,
          message: notifMsg,
          link: `/dashboard/chat?id=${conversationId}`,
          conversationId: conversationId,
        });
        await realtime.emitToUser(pId, "chat:new_conversation", result.conversation);
      }
    } catch (e) {
      console.warn("[Chat] Notification/Socket emission failed in createConversation:", e.message);
    }

    res.json(result);
  } catch (err) {
    console.error("[Chat] createConversation Fatal Error:", err.message);
    res.status(500).json({ error: err.message || "Failed to create conversation", details: err.message });
  }
};

exports.acceptConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Check if member exists and status
    const { data: existingMember, error: fetchError } = await supabase
      .from("conversation_members")
      .select("status")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingMember) {
      return res.status(404).json({
        error: "You are not a member of this chat",
      });
    }

    if (existingMember.status === "accepted") {
      return res.json({
        success: true,
        message: "Already accepted",
        member: [existingMember],
      });
    }

    // Update status to accepted
    const { data: updatedMember, error: updateError } = await supabase
      .from("conversation_members")
      .update({ status: "accepted" })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .select()
      .single();

    if (updateError) {
      console.error("[Chat] Error updating member status:", updateError.message);
      throw updateError;
    }

    // Notify other members
    try {
      const { data: members } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", userId);

      const { data: accepter } = await supabase.from("profiles").select("username").eq("id", userId).single();

      if (members) {
        for (const m of members) {
          const notifTitle = "Chat Request Accepted";
          const notifMsg = `${accepter?.username || "Someone"} accepted your chat request!`;
          await createNotification({
            receiverId: m.user_id,
            senderId: userId,
            type: "chat_accepted",
            title: notifTitle,
            message: notifMsg,
            link: `/dashboard/chat?id=${conversationId}`,
            conversationId: conversationId,
          });
          await dispatchFastPush({
            receiverId: m.user_id,
            type: "chat_accepted",
            title: notifTitle,
            message: notifMsg,
            link: `/dashboard/chat?id=${conversationId}`,
            conversationId: conversationId,
          });
          await realtime.emitToUser(m.user_id, "chat:conversation_updated", { conversationId, userId, status: "accepted" });
        }
      }
      // Broadcast to room so any open chat window unlocks instantly without refresh
      await realtime.emitToConversation(conversationId, "chat:conversation_updated", {
        conversationId,
        userId,
        status: "accepted",
      });
    } catch (notifErr) {
      console.warn("[Chat] Notification failure in acceptConversation:", notifErr.message);
    }

    // Also notify self across other tabs/devices
    await realtime.emitToUser(userId, "chat:conversation_updated", {
      conversationId,
      userId,
      status: "accepted",
    });


    res.json({ success: true, member: updatedMember });
  } catch (err) {
    console.error("[Chat] Error accepting conversation:", err.message);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
};

// --- Messages ---

exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, before, after, after_id, after_created_at } = req.query;
    const userId = req.user.id;

    let clearedAt = null;
    try {
      // Fetch cleared_at for the user - wrap in try-catch as column might be missing
      const { data: member } = await supabase
        .from("conversation_members")
        .select("cleared_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      clearedAt = member?.cleared_at;
    } catch (e) {
      console.warn("[Chat] Could not fetch cleared_at (column might be missing):", e.message);
    }

    // Build the main messages query with attachment join.
    // IMPORTANT: .eq('is_deleted', false) ensures soft-deleted messages never reach clients.
    let query = supabase
      .from("messages")
      .select("*, attachment:media_attachments(*), sender:profiles(id, username, full_name, avatar_url)")
      .eq("conversation_id", conversationId)
      .eq("is_deleted", false);

      const cursorCreatedAt = after_created_at || after;
      const cursorMessageId = after_id;

      if (cursorCreatedAt) {
        if (cursorMessageId) {
          // Gate 1: Deterministic 2-tuple cursor (created_at > cursor) OR (created_at = cursor AND id > cursor_id)
          query = query.or(`created_at.gt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.gt.${cursorMessageId})`).order("created_at", { ascending: true });
        } else {
          query = query.gt("created_at", cursorCreatedAt).order("created_at", { ascending: true });
        }
      } else {
        query = query.order("created_at", { ascending: false });
      }

      query = query.limit(parseInt(limit));

      if (before) {
        query = query.lt("created_at", before);
      }

      if (clearedAt) {
        query = query.gt("created_at", clearedAt);
      }

    try {
      const { data, error } = await query;

      if (error) {
        // PGRST200/42703 = missing table/column. Fall back to a basic query that
        // still attempts the reply_to join. If that also fails, use select(*).
        if (
          error.code === "PGRST200" ||
          error.code === "42703" ||
          error.message.includes("media_attachments")
        ) {
          console.warn(
            "[Chat Controller] Falling back to basic messages query",
          );
          let fallbackQuery = supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
            .limit(parseInt(limit));

          if (before) fallbackQuery = fallbackQuery.lt("created_at", before);
          if (clearedAt) fallbackQuery = fallbackQuery.gt("created_at", clearedAt);

          const { data: fb1Data, error: fb1Error } = await fallbackQuery;

          if (!fb1Error) {
            const fbArr = fb1Data || [];
            await _hydrateReplyTo(fbArr);
            await _mapSenderTypeBatch(fbArr, userId);
            return res.json(fbArr.reverse());
          }

          // Second fallback: plain select(*) + manual reply_to hydration
          console.warn("[Chat Controller] reply_to join also failed, using select(*) + manual hydration");
          let plainQuery = supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
            .limit(parseInt(limit));

          if (before) plainQuery = plainQuery.lt("created_at", before);
          if (clearedAt) plainQuery = plainQuery.gt("created_at", clearedAt);

          const { data: simpleData, error: simpleError } = await plainQuery;
          if (simpleError) throw simpleError;

          // Manual reply_to hydration — batch load all referenced parent messages
          const simpleArr = simpleData || [];
          await _hydrateReplyTo(simpleArr);
          await _mapSenderTypeBatch(simpleArr, userId);
          return res.json(simpleArr.reverse());
        }
        throw error;
      }

      // Primary query succeeded
      const primaryArr = data || [];
      await _hydrateReplyTo(primaryArr);
      await _mapSenderTypeBatch(primaryArr, userId);
      res.json(primaryArr.reverse());
    } catch (innerErr) {
      console.warn("[Chat Controller] Inner query error:", innerErr.message);
      // Final fallback — also exclude deleted & cleared messages + manual reply_to hydration
      let finalQuery = supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(parseInt(limit));

      if (before) finalQuery = finalQuery.lt("created_at", before);
      if (clearedAt) finalQuery = finalQuery.gt("created_at", clearedAt);

      const { data: finalData, error: finalError } = await finalQuery;
      if (finalError) throw finalError;
      const finalArr = finalData || [];
      await _hydrateReplyTo(finalArr);
      await _mapSenderTypeBatch(finalArr, userId);
      res.json(finalArr.reverse());
    }
  } catch (err) {
    console.error("Error fetching messages:", err.message);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
};

exports.searchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { q } = req.query;
    const userId = req.user.id;

    if (!q) return res.status(400).json({ error: "Search query required" });

    let clearedAt = null;
    try {
      const { data: member } = await supabase
        .from("conversation_members")
        .select("cleared_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();
      clearedAt = member?.cleared_at;
    } catch (_) {}

    const filterCleared = (list) => {
      if (!clearedAt) return list || [];
      const clearedTime = new Date(clearedAt).getTime();
      return (list || []).filter(m => new Date(m.created_at).getTime() > clearedTime);
    };

    // Try full query with attachments
    try {
      let searchQuery = supabase
        .from("messages")
        .select("*, attachment:media_attachments(*)")
        .eq("conversation_id", conversationId)
        .eq("is_deleted", false)
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (clearedAt) {
        searchQuery = searchQuery.gt("created_at", clearedAt);
      }

      const { data, error } = await searchQuery;

      if (error) {
        if (
          error.code === "PGRST200" ||
          error.message.includes("media_attachments")
        ) {
          console.warn(
            "[Chat Controller] Falling back to basic search (media_attachments missing)",
          );
          let simpleSearch = supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .eq("is_deleted", false)
            .ilike("content", `%${q}%`)
            .order("created_at", { ascending: false })
            .limit(100);

          if (clearedAt) simpleSearch = simpleSearch.gt("created_at", clearedAt);

          const { data: simpleData, error: simpleError } = await simpleSearch;

          if (simpleError) throw simpleError;
          return res.json(filterCleared(simpleData));
        }
        throw error;
      }
      res.json(filterCleared(data));
    } catch (innerErr) {
      console.warn("[Chat Controller] Search error:", innerErr.message);
      let fallbackSearch = supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("is_deleted", false)
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (clearedAt) fallbackSearch = fallbackSearch.gt("created_at", clearedAt);

      const { data, error } = await fallbackSearch;
      if (error) throw error;
      res.json(filterCleared(data));
    }
  } catch (err) {
    console.error("Error searching messages:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.markMessageRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const now = new Date().toISOString();

    try {
      let msgRow = null;
      let readAt = now;

      const { data, error } = await supabase
        .from("messages")
        .update({ read_at: now })
        .eq("id", messageId)
        .neq("sender_id", userId) // Only mark as read if not the sender
        .select()
        .single();

      if (error) {
        if (error.code === "42703") {
          // Column doesn't exist — nothing we can do, skip gracefully
          console.warn("[Chat Controller] read_at column missing, skipping update");
          return res.json({ success: true, note: "read_at column missing" });
        }
        if (error.code === "PGRST204") {
          // 0 rows updated — message may already be read, or sender_id === userId.
          // Fall back to a plain SELECT so we can still emit with the stored timestamp.
          console.warn("[Chat Controller] markMessageRead: 0 rows updated, falling back to SELECT");
          const { data: existing } = await supabase
            .from("messages")
            .select("id, conversation_id, sender_id, read_at")
            .eq("id", messageId)
            .single();
          if (existing && existing.sender_id !== userId) {
            msgRow = existing;
            readAt = existing.read_at || now;
          } else {
            return res.json({ success: true, note: "no-op" });
          }
        } else {
          throw error;
        }
      } else {
        msgRow = data;
      }

      if (!msgRow) return res.json({ success: true, note: "no-op" });

      const receiptPayload = { messageId, conversationId: msgRow.conversation_id, userId, readAt };
      console.log(`[FORENSIC][API] Read ACK Processing | messageId:${messageId} | conversationId:${msgRow.conversation_id} | userId:${userId} | ts:${Date.now()}`);

      // Emit to conversation room (for ChatScreen listeners)
      await realtime.emitToConversation(msgRow.conversation_id, "chat:message_read", receiptPayload);
      // ALSO emit directly to the original sender so their ChatList updates too
      await realtime.emitToUser(msgRow.sender_id, "chat:message_read", receiptPayload);
      console.log(`[FORENSIC][API] Read ACK Broadcast Done | messageId:${messageId} | senderId:${msgRow.sender_id} | ts:${Date.now()}`);

      res.json({ success: true });
    } catch (updateErr) {
      console.warn("[Chat Controller] Failed to mark read:", updateErr.message);
      res.json({ success: true, error: "Feature unavailable" });
    }
  } catch (err) {
    console.error("Error marking message read:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.markMessageDelivered = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const { deviceId } = req.body; // Phase 6: per-device receipt
    const now = new Date().toISOString();

    try {
      let msgRow = null;
      let deliveredAt = now;

      const { data, error } = await supabase
        .from("messages")
        .update({ delivered_at: now })
        .eq("id", messageId)
        .neq("sender_id", userId) // Only mark as delivered if not the sender
        .select()
        .single();

      if (error) {
        if (error.code === "42703") {
          // Column doesn't exist — skip gracefully
          console.warn("[Chat Controller] delivered_at column missing, skipping update");
          return res.json({ success: true, note: "delivered_at column missing" });
        }
        if (error.code === "PGRST204") {
          // 0 rows updated — message already delivered, or sender_id === userId.
          // Fall back to SELECT so we can still emit with the actual stored timestamp.
          console.warn("[Chat Controller] markMessageDelivered: 0 rows updated, falling back to SELECT");
          const { data: existing } = await supabase
            .from("messages")
            .select("id, conversation_id, sender_id, delivered_at")
            .eq("id", messageId)
            .single();
          if (existing && existing.sender_id !== userId) {
            msgRow = existing;
            deliveredAt = existing.delivered_at || now;
          } else {
            return res.json({ success: true, note: "no-op" });
          }
        } else {
          throw error;
        }
      } else {
        msgRow = data;
      }

      if (!msgRow) return res.json({ success: true, note: "no-op" });

      // Phase 6: fire per-device receipt (fire-and-forget, non-blocking)
      if (deviceId) {
        supabase.rpc('rpc_mark_delivered', {
            p_message_id: messageId,
            p_device_id: deviceId
        }).catch(e => console.warn('[Phase6] rpc_mark_delivered failed:', e.message));

        // ==========================================
        // EVENT LEDGER: Emit DELIVERED
        // ==========================================
        emitMessageEvent({
          messageId: messageId,
          conversationId: msgRow.conversation_id,
          userId,
          deviceId,
          sessionId: req.body.sessionId || null,
          eventType: 'DELIVERED',
          correlationId: messageId
        });
      }

      const receiptPayload = { messageId, conversationId: msgRow.conversation_id, userId, delivered_at: deliveredAt };
      console.log(`[FORENSIC][API] Delivery ACK Processing | messageId:${messageId} | conversationId:${msgRow.conversation_id} | userId:${userId} | ts:${Date.now()}`);

      // Emit to conversation room (for ChatScreen listeners)
      await realtime.emitToConversation(msgRow.conversation_id, "chat:message_delivered", receiptPayload);
      // ALSO emit directly to the original sender so their ChatList updates too
      await realtime.emitToUser(msgRow.sender_id, "chat:message_delivered", receiptPayload);
      console.log(`[FORENSIC][API] Delivery ACK Broadcast Done | messageId:${messageId} | senderId:${msgRow.sender_id} | ts:${Date.now()}`);

      res.json({ success: true });
    } catch (updateErr) {
      console.warn("[Chat Controller] Failed to mark delivered:", updateErr.message);
      res.json({ success: true, error: "Feature unavailable" });
    }
  } catch (err) {
    console.error("Error marking message delivered:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.markMessagesDeliveredBatch = async (req, res) => {
  try {
    const { messageIds } = req.body;
    const userId = req.user.id;
    const now = new Date().toISOString();

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: "messageIds must be a non-empty array" });
    }

    const { data, error } = await supabase
      .from("messages")
      .update({ delivered_at: now })
      .in("id", messageIds)
      .neq("sender_id", userId)
      .select("id, conversation_id, sender_id");

    if (error) throw error;

    if (data && data.length > 0) {
      // Group by conversation to minimize socket emits
      const byConversation = {};
      data.forEach(msg => {
        if (!byConversation[msg.conversation_id]) {
          byConversation[msg.conversation_id] = { messageIds: [], senderIds: new Set() };
        }
        byConversation[msg.conversation_id].messageIds.push(msg.id);
        byConversation[msg.conversation_id].senderIds.add(msg.sender_id);
      });

      for (const [convId, group] of Object.entries(byConversation)) {
        const payload = { 
          conversationId: convId, 
          messageIds: group.messageIds, 
          userId, 
          delivered_at: now 
        };
        await realtime.emitToConversation(convId, "chat:messages_delivered_batch", payload);
        for (const senderId of group.senderIds) {
          await realtime.emitToUser(senderId, "chat:messages_delivered_batch", payload);
        }
      }
    }

    res.json({ success: true, updatedCount: data?.length || 0 });
  } catch (err) {
    console.error("Error batch marking messages delivered:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.webhookDeliver = async (req, res) => {
  try {
    const { messageId } = req.params;
    const now = new Date().toISOString();

    if (!messageId) {
      return res.status(400).json({ error: "Missing messageId" });
    }

    const { data: updatedData } = await supabase
      .from("messages")
      .update({ delivered_at: now })
      .eq("id", messageId)
      .is("delivered_at", null)
      .select()
      .maybeSingle();

    let targetMessage = updatedData;
    if (!targetMessage) {
      const { data: existingData } = await supabase
        .from("messages")
        .select("*")
        .eq("id", messageId)
        .maybeSingle();
      targetMessage = existingData;
    }

    if (targetMessage) {
      const receiptPayload = {
        messageId: targetMessage.id,
        conversationId: targetMessage.conversation_id,
        userId: targetMessage.sender_id,
        senderId: targetMessage.sender_id,
        delivered_at: targetMessage.delivered_at || now,
        deliveredAt: targetMessage.delivered_at || now
      };

      console.log('[FORENSIC][API] webhookDeliver | messageId:' + targetMessage.id + ' | senderId:' + targetMessage.sender_id + ' | conversationId:' + targetMessage.conversation_id + ' | ts:' + Date.now());

      const { data: members } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", targetMessage.conversation_id);

      const memberIds = (members && members.length > 0) ? members.map(m => m.user_id) : [targetMessage.sender_id];

      await realtime.emitToUsers(memberIds, 'chat:message_delivered', receiptPayload);
      await realtime.emitToUsers(memberIds, 'chat:delivery_receipt', receiptPayload);
      await realtime.emitToConversation(targetMessage.conversation_id, 'chat:message_delivered', receiptPayload);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error in webhookDeliver:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    if (!req.params || !req.params.conversationId) {
      return res.status(400).json({ error: "Conversation ID is required" });
    }
    if (!req.body) {
      return res.status(400).json({ error: "Request body is required" });
    }
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { conversationId } = req.params;
    const { content, type, attachmentId, replyToId, deviceId, sessionId, clientSendTs } = req.body;
    const userId = req.user.id;

    const t1_ApiReceived = Date.now();
    const startTimeMs = Date.now();
    logger.info("Message request received [Stage 1]", {
      correlationId: req.correlationId,
      userId,
      conversationId,
      eventId: req.body.eventId
    });

    const { data: allMembers, error: membersError } = await supabase
      .from("conversation_members")
      .select("user_id, is_muted, is_deleted, cleared_at, status")
      .eq("conversation_id", conversationId);
      
    if (membersError) {
      console.warn("[Chat Controller] conversation_members lookup warning:", membersError.message);
    }

    // Re-expose as `members` so the rest of the function remains unchanged.
    const members = allMembers || [];
    
    // We only care about blocking in 1-on-1 direct conversations.
    // If it's a direct conversation, there will be exactly 2 members.
    if (members.length === 2) {
      const otherMember = members.find(m => m.user_id !== userId);
      if (otherMember) {
        const recipientId = otherMember.user_id;
        
        // Check if there is any block between userId and recipientId
        const { data: blocks, error: blocksError } = await supabase
          .from("user_blocks")
          .select("blocker_id, blocked_id")
          .or(`and(blocker_id.eq.${userId},blocked_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_id.eq.${userId})`);
          
        if (blocksError && blocksError.code !== 'PGRST116') {
          console.warn("[Chat Block Check] Failed to check user_blocks table:", blocksError.message);
        } else if (blocks && blocks.length > 0) {
          const isBlockedByMe = blocks.some(b => b.blocker_id === userId);
          if (isBlockedByMe) {
            return res.status(403).json({ error: "BLOCKED_BY_YOU", message: "You have blocked this user" });
          } else {
            return res.status(403).json({ error: "BLOCKED_BY_THEM", message: "This user has blocked you" });
          }
        }
      }
    }

    // AUTO-REOPEN: If any member soft-deleted this conversation, reset is_deleted when a message is sent
    // so the conversation automatically reappears in their chat list.
    // CRITICAL: Preserve cleared_at watermark timestamp so previously cleared messages remain hidden while new messages display.
    const softDeletedMembers = (members || []).filter(m => m.is_deleted);
    if (softDeletedMembers.length > 0) {
      const delUserIds = softDeletedMembers.map(m => m.user_id);
      await supabase
        .from("conversation_members")
        .update({ is_deleted: false, deleted_at: null })
        .eq("conversation_id", conversationId)
        .in("user_id", delUserIds);

      softDeletedMembers.forEach(m => {
        m.is_deleted = false;
        m.deleted_at = null;
      });
    }

    // AUTO-ACCEPT: If the sender's membership status is currently 'pending', sending a message
    // automatically accepts the conversation request and updates status to 'accepted'.
    const currentMember = members.find(m => m.user_id === userId);
    if (currentMember && currentMember.status === "pending") {
      logger.info("[Chat] Auto-accepting pending request on message send", { conversationId, userId });
      await supabase
        .from("conversation_members")
        .update({ status: "accepted" })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);

      currentMember.status = "accepted";

      // Emit status updates to both conversation room and individual user channels
      realtime.emitToConversation(conversationId, "chat:conversation_updated", {
        conversationId,
        userId,
        status: "accepted"
      });
      realtime.emitToUser(userId, "chat:conversation_updated", {
        conversationId,
        userId,
        status: "accepted"
      });
    }

    logger.debug("Validation passed [Stage 2]", {
      correlationId: req.correlationId,
      userId,
      conversationId,
      durationMs: Date.now() - startTimeMs
    });

    // Analysis: Sentiment (if text)
    // FIX 3: Uses module-level _sentimentAnalyzer — no require() or new() per request.
    let sentiment = null;
    let detectedLang = "en";

    if ((type === "text" || !type) && content) {
      const result = _sentimentAnalyzer.analyze(content);
      sentiment = {
        score: result.score,
        comparative: result.comparative,
        label: result.score > 0
          ? "positive"
          : result.score < 0
          ? "negative"
          : "neutral",
      };
      // Language detection kept off the critical path (defaults to "en" for instant delivery).
      detectedLang = "en";
    }

    let createdMessageId = null;
    let isDuplicate = false;
    const rawEventId = req.body.eventId;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const eventId = (rawEventId && UUID_REGEX.test(rawEventId)) ? rawEventId : crypto.randomUUID();

    const t2_DbInsertStart = Date.now();

    try {
      let insertedMessage = null;

      const isTransactional = features.isFeatureEnabled('SEQUENCE_ENFORCEMENT', userId);
      console.log(`[SEQUENCE_MODE]: ${isTransactional ? 'transactional' : 'legacy'} (User: ${userId})`);

      if (isTransactional) {
        console.log(`[Chat Controller] Attempting RPC Transaction for sendMessage (event_id: ${eventId})`);
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_send_message', {
              p_conversation_id: conversationId,
              p_sender_id: userId,
              p_content: content || '',
              p_type: type || "text",
              p_event_id: eventId,
              p_original_language: detectedLang,
              p_attachment_id: attachmentId || null,
              p_reply_to_id: replyToId || null
          });

          if (rpcError) {
            console.warn(`[Chat Controller] rpc_send_message returned error (${rpcError.code}), falling back to legacy insert: ${rpcError.message}`);
          } else if (rpcData && rpcData.message) {
            insertedMessage = rpcData.message;
            isDuplicate = rpcData.is_duplicate;
            
            if (isDuplicate) {
               console.log(`[Chat Controller] Idempotent send: duplicate event_id ${eventId} rejected safely.`);
            } else if (insertedMessage?.sequence_number) {
               replayGuard.advance(conversationId, insertedMessage.sequence_number);
            }
          }
        } catch (rpcCatchErr) {
          console.warn(`[Chat Controller] rpc_send_message threw exception, falling back to legacy insert: ${rpcCatchErr.message}`);
        }
      }

      if (!insertedMessage) {
        // Explicit server-side idempotency check
        if (eventId) {
          const { data: existingMsg } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("event_id", eventId)
            .maybeSingle();

          if (existingMsg) {
            console.log(`[Chat Controller] Idempotent check: event_id ${eventId} already processed (ID: ${existingMsg.id}). Returning existing row.`);
            insertedMessage = existingMsg;
            isDuplicate = true;
          }
        }

        if (!insertedMessage) {
          let fallbackSeq = 1;
          try {
            const { data: maxSeqRow } = await supabase
              .from("messages")
              .select("sequence_number")
              .eq("conversation_id", conversationId)
              .order("sequence_number", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (maxSeqRow && maxSeqRow.sequence_number) {
              fallbackSeq = Number(maxSeqRow.sequence_number) + 1;
            }
          } catch (_) { fallbackSeq = 1; }

          const insertPayload = {
            conversation_id: conversationId,
            sender_id: userId,
            content: content || '',
            type: type || "text",
            sentiment,
            original_language: detectedLang,
            event_id: eventId,
            sequence_number: fallbackSeq
          };
          if (attachmentId) insertPayload.attachment_id = attachmentId;
          if (replyToId)    insertPayload.reply_to_id   = replyToId;

          const { data: insertData, error: insertError } = await supabase
            .from("messages")
            .insert([insertPayload])
            .select("id, sequence_number, created_at, updated_at")
            .single();

          if (insertError) {
            console.warn("[Chat Controller] Primary insert failed, attempting safe basic insert fallback:", insertError.code, insertError.message);
            const fallbackPayload = {
              conversation_id: conversationId,
              sender_id: userId,
              content: content || '',
              type: type || "text",
              event_id: eventId
            };
            if (attachmentId) fallbackPayload.attachment_id = attachmentId;
            if (replyToId)    fallbackPayload.reply_to_id   = replyToId;

            const { data: retryData, error: retryErr } = await supabase
              .from("messages")
              .insert([fallbackPayload])
              .select("id, sequence_number, created_at, updated_at")
              .single();

            if (retryErr) throw retryErr;
            insertedMessage = retryData;
          } else {
            insertedMessage = insertData;
          }
        }
      }

      const t3_DbInsertDone = Date.now();
      createdMessageId = insertedMessage.id;

      // ── CHATLIST FIX: Stamp authoritative last-message pointer (fire-and-forget) ──
      supabase
        .from("conversations")
        .update({
          last_message_id: createdMessageId,
          last_message_at: insertedMessage.created_at || new Date().toISOString()
        })
        .eq("id", conversationId)
        .then(({ error: lmErr }) => {
          if (lmErr) console.warn("[Chat] last_message_at stamp failed:", lmErr.message);
        });

      logger.info("[FORENSIC][API] Message Saved | Stage 3", {
        correlationId: req.correlationId,
        messageId: createdMessageId,
        conversationId,
        senderId: userId,
        eventId,
        durationMs: Date.now() - startTimeMs
      });

      // ── FIX 2: Reconstruct response payload from insert result + request body.
      // Previously: a second SELECT * FROM messages JOIN profiles JOIN media_attachments
      // was done here to "hydrate" the message — adding ~50ms to EVERY send.
      // We already have all the data in memory. Build the payload directly.
      const nowIso = insertedMessage.created_at || new Date().toISOString();
      const reconstructedMessage = {
        id:              createdMessageId,
        event_id:        eventId,
        conversation_id: conversationId,
        sender_id:       userId,
        content:         content || '',
        type:            type || 'text',
        created_at:      nowIso,
        updated_at:      nowIso,
        is_deleted:      false,
        is_edited:       false,
        sentiment:       sentiment,
        detected_language: detectedLang,
        sequence_number: insertedMessage.sequence_number || null,
        status:          'sent',
        // Sender profile — use cache (warm after first send), gracefully null on cold start.
        // Cache is populated by the post-send background block on every notification dispatch.
        sender: senderProfileCache.get(userId) || {
          id:         userId,
          username:   null,
          full_name:  null,
          avatar_url: null,
        },
        // Attachment — only present for media messages
        attachment: null,
        // reply_to — carry forward from the request (client already has context)
        ...(replyToId ? { reply_to_id: replyToId } : {}),
      };


      // Normalize reply_to shape for consistency across transactional/legacy paths
      // (isTransactional already declared above in the DB insert branch)
      let safePayload = isTransactional
        ? (normalizeOutboundMessage(reconstructedMessage) || reconstructedMessage)
        : reconstructedMessage;


      // ── FIX 1: Respond to the sender IMMEDIATELY — before any post-send work. ──
      // This is what WhatsApp/Telegram/Signal do: DB insert → respond → fan-out.
      if (!res.headersSent) {
        res.json(safePayload);
        logger.info("Response returned [Stage 5 — instant]", {
          correlationId: req.correlationId,
          userId,
          conversationId,
          messageId: createdMessageId,
          eventId,
          durationMs: Date.now() - startTimeMs
        });
      }

      // ── EVENT LEDGER: Emit SENT (fire-and-forget, non-blocking) ──
      if (deviceId) {
        emitMessageEvent({
          messageId: createdMessageId,
          conversationId,
          userId,
          deviceId,
          sessionId,
          eventType: 'SENT',
          correlationId: eventId
        });
      }

      // ── FIX 6: ALL post-send work moved here — fire-and-forget after response ──
      // Socket broadcast, notifications, AI support, auto-reply — NONE of these
      // should ever block the HTTP response back to the sender's device.
      setImmediate(async () => {
        try {
          // ── SOCKET BROADCAST to room (recipient gets the message, exclude sender to prevent echo duplicate) ──
          await realtime.emitToConversation(conversationId, "chat:message", safePayload, { excludeUserId: userId });

          // ── NOTIFICATION LOGIC ─────────────────────────────────────────────────
          const otherMembers = members.filter(m => m.user_id !== userId);
          if (otherMembers.length > 0) {
            let senderName = usernameCache.get(userId);
            if (!senderName) {
              try {
                const { data: sender } = await supabase
                  .from("profiles").select("id, username, full_name, avatar_url").eq("id", userId).single();
                senderName = sender?.username || "Someone";
                usernameCache.set(userId, senderName);
                // Populate full profile cache so next sendMessage has instant sender object
                if (sender) {
                  senderProfileCache.set(userId, {
                    id: userId,
                    username: sender.username || null,
                    full_name: sender.full_name || null,
                    avatar_url: sender.avatar_url || null,
                  });
                }
              } catch (_) { senderName = "Someone"; }
            }

            const previewContent = getNotificationPreview(type || 'text', content);

            const notificationPromises = otherMembers.map(async (member) => {
              if (member.is_muted) return;
              try {
                // Run DB notification persist + push dispatch CONCURRENTLY.
                // skipPush:true stops createNotification firing its own gateway HTTP call
                // so dispatchFastPush is the sole, immediate push path — no double-push race.
                await Promise.all([
                  createNotification({
                    receiverId:     member.user_id,
                    senderId:       userId,
                    type:           "chat_message",
                    title:          senderName,
                    message:        previewContent,
                    link:           `/dashboard/chat?id=${conversationId}`,
                    messageId:      createdMessageId,
                    conversationId: conversationId,
                    skipPush:       true, // dispatchFastPush below is the sole push path
                  }),
                  dispatchFastPush({
                    receiverId:     member.user_id,
                    type:           "chat_message",
                    title:          senderName,
                    message:        previewContent,
                    link:           `/dashboard/chat?id=${conversationId}`,
                    messageId:      createdMessageId,
                    conversationId: conversationId,
                    trace: {
                      clientSendTs,
                      apiReceiveTs: t1_ApiReceived,
                      dbStartTs:    t2_DbInsertStart,
                      dbDoneTs:     t3_DbInsertDone,
                    }
                  }),
                ]);
              } catch (pushErr) {
                console.warn("[Chat Notify] Push failed for", member.user_id, pushErr.message);
              }
            });
            Promise.allSettled(notificationPromises);
          }

          // ── MENTION LOGIC ──────────────────────────────────────────────────────
          if (content) {
            const mentions = content.match(/@(\w+)/g);
            if (mentions) {
              try {
                const usernames = mentions.map(m => m.substring(1));
                const { data: mentionedUsers } = await supabase
                  .from("profiles").select("id, username").in("username", usernames);
                if (mentionedUsers) {
                  let senderName = usernameCache.get(userId) || "Someone";
                  const previewContent = getNotificationPreview(type || 'text', content);
                  const mentionJobs = mentionedUsers
                    .filter(mUser => mUser.id !== userId)
                    .map(async (mUser) => {
                      await dispatchFastPush({
                        receiverId: mUser.id, type: "mention", title: senderName,
                        message: `Mentioned you: ${previewContent}`,
                        link: `/dashboard/chat?id=${conversationId}`,
                        messageId: createdMessageId, conversationId,
                      });
                      await createNotification({
                        receiverId: mUser.id, senderId: userId, type: "mention",
                        title: senderName, message: `Mentioned you: ${previewContent}`,
                        link: `/dashboard/chat?id=${conversationId}`,
                        messageId: createdMessageId, conversationId, skipPush: true,
                      });
                    });
                  Promise.allSettled(mentionJobs);
                }
              } catch (mentionErr) {
                console.warn("[Chat Mention] Non-fatal mention error:", mentionErr.message);
              }
            }
          }

          // ── AI SUPPORT AUTO-REPLY (fire-and-forget) ────────────────────────────
          try {
            const { data: convInfo } = await supabase
              .from("conversations").select("chat_type, support_status")
              .eq("id", conversationId).single();

            if (convInfo && convInfo.chat_type === "support") {
              const { data: senderProfile } = await supabase
                .from("profiles").select("plan_tier, role").eq("id", userId).maybeSingle();
              const isSenderAdmin = senderProfile?.plan_tier === "admin" || senderProfile?.role === "admin";

              if (!isSenderAdmin) {
                const supportService = require("../services/supportService");
                const aiRes = await supportService.handleUserSupportMessage(conversationId, content || "", userId);
                if (aiRes?.message) {
                  // Broadcast AI reply to conversation room
                  await realtime.emitToConversation(conversationId, "chat:message", aiRes.message);
                }
              } else {
                await supabase.from("conversation_members")
                  .upsert([{ conversation_id: conversationId, user_id: userId, role: "admin", status: "accepted" }],
                    { onConflict: "conversation_id,user_id" });
                await supabase.from("conversations")
                  .update({ support_status: "pending", updated_at: new Date().toISOString() })
                  .eq("id", conversationId);
                realtime.emitToConversation(conversationId, "chat:conversation_updated", {
                  id: conversationId, support_status: "pending"
                });
              }
            }
          } catch (aiErr) {
            logger.warn(`[sendMessage:AiSupport] Non-fatal AI trigger error: ${aiErr.message}`);
          }

          // ── FIX 4: AUTO-REPLY — uses TTL-cached settings, NOT a live DB SELECT ──
          try {
            const settings = await _getAutoReplySettings();
            if (settings?.enabled) {
              const now = new Date();
              const hours = now.getUTCHours();
              const parseHour = (h) => typeof h === 'string' && h.includes(':')
                ? parseInt(h.split(':')[0]) : parseInt(h);
              const start = parseHour(settings.start_hour);
              const end   = parseHour(settings.end_hour);
              const isOffline = start > end
                ? (hours >= start || hours < end)
                : (hours >= start && hours < end);

              if (isOffline) {
                const botSenderId = '00000000-0000-0000-0000-000000000000';
                const { data: autoMsg, error: autoErr } = await supabase
                  .from("messages")
                  .insert([{ conversation_id: conversationId, sender_id: botSenderId,
                             content: settings.message, type: "text" }])
                  .select().single();
                if (!autoErr) {
                  await realtime.emitToConversation(conversationId, "chat:message", autoMsg);
                }
              }
            }
          } catch (autoReplyErr) {
            console.warn("[Chat] Auto-reply non-fatal error:", autoReplyErr.message);
          }

          // ── SERVER-SIDE ACK TIMEOUT RECHECK (Self-Healing Delivery) ───────────
          if (PIPELINE_VERSION !== 'v2' && !isDuplicate && safePayload.id && members.length > 0) {
            const recheckMessageId = safePayload.id;
            const recheckMembers = [...members];
            setTimeout(async () => {
              try {
                const { data: msgCheck } = await supabase
                  .from('messages').select('id, delivered_at').eq('id', recheckMessageId).single();
                if (!msgCheck || msgCheck.delivered_at) return;
                const userIds = recheckMembers.map(m => m.user_id);
                await realtime.emitToUsers(userIds, "chat:message", safePayload);
              } catch (recheckErr) {
                console.warn(`[FORENSIC] ACK Recheck failed: ${recheckErr.message}`);
              }
            }, 30000);
          }

        } catch (postSendErr) {
          // Non-fatal — response already sent, log and move on
          console.error("[Chat] Post-send background task error:", postSendErr.message);
        }
      });

    } catch (msgErr) {
      console.error("====================== CHAT ERROR TRACE ======================");
      console.error(msgErr.stack || msgErr);
      console.error("==============================================================");
      if (!res.headersSent) {
        return res.status(500).json({ error: msgErr.message || "Failed to send message", stack: msgErr.stack });
      }
    }
  } catch (error) {
    console.error("🔥 SEND MESSAGE FAILED");
    console.error("Correlation ID:", req.correlationId);
    console.error(error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Internal Server Error",
        correlationId: req.correlationId
      });
    }
  }
};

// Create support chat - User contacts admin
exports.createSupportChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject } = req.body;

    // Check if user already has an open support chat
    const { data: existingChats } = await supabase
      .from("conversations")
      .select(`
                id,
                support_status,
                members:conversation_members!inner (user_id)
            `)
      .eq("chat_type", "support")
      .neq("support_status", "resolved")
      .eq("members.user_id", userId);

    if (existingChats && existingChats.length > 0) {
      return res.status(400).json({
        error: "You already have an open support chat",
        existingChatId: existingChats[0].id,
      });
    }

    // Get user profile for chat name
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    // Create support conversation
    const chatName = subject || `Support: ${profile?.username || "User"}`;
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .insert([{
        type: "direct",
        name: chatName,
        chat_type: "support",
        support_status: "open",
      }])
      .select()
      .single();

    if (convError) throw convError;

    // Add user as member
    const { error: memberError } = await supabase
      .from("conversation_members")
      .insert([{
        conversation_id: convData.id,
        user_id: userId,
        role: "member",
        status: "accepted",
      }]);

    if (memberError) throw memberError;

    // Notify admins via Gateway
    await realtime.emitToAdmin("chat:new_support_chat", {
      ...convData,
      user: profile,
    });

    res.json({ conversation: convData });
  } catch (err) {
    console.error("Error creating support chat:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Delete conversation
exports.deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify user is a member of the conversation
    const { data: member, error: memberError } = await supabase
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    if (memberError || !member) {
      console.error("[Chat Delete] Membership verification failed:", {
        conversationId,
        userId,
        error: memberError?.message,
        memberFound: !!member,
      });
      return res.status(403).json({
        error: "Access denied or conversation not found",
      });
    }

    const nowIso = new Date().toISOString();
    const { data: convData } = await supabase
      .from("conversations")
      .select("type")
      .eq("id", conversationId)
      .single();

    if (convData && convData.type === "direct") {
      // Find peer ID for direct chat to mark all direct conversation records with that peer as deleted
      const { data: members } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId);
      
      const otherMember = members?.find(m => m.user_id !== userId);
      const peerId = otherMember?.user_id;

      let convIdsToMark = [conversationId];
      if (peerId) {
        const { data: userConvs } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", userId);
        
        const userConvIds = (userConvs || []).map(c => c.conversation_id);
        if (userConvIds.length > 0) {
          const { data: peerConvs } = await supabase
            .from("conversation_members")
            .select("conversation_id")
            .in("conversation_id", userConvIds)
            .eq("user_id", peerId);
          
          if (peerConvs && peerConvs.length > 0) {
            convIdsToMark = peerConvs.map(c => c.conversation_id);
          }
        }
      }

      // Per-user soft-deletion: mark is_deleted = true and set deleted_at & cleared_at
      const { error: updateError } = await supabase
        .from("conversation_members")
        .update({ is_deleted: true, deleted_at: nowIso, cleared_at: nowIso })
        .in("conversation_id", convIdsToMark)
        .eq("user_id", userId);

      if (updateError) throw updateError;
    } else {
      // It's a group chat, soft delete or remove member
      const { error: membersDeleteError } = await supabase
        .from("conversation_members")
        .update({ is_deleted: true, deleted_at: nowIso, cleared_at: nowIso })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);

      if (membersDeleteError) throw membersDeleteError;

      // Optional: Only delete the actual conversation and messages if ALL members are deleted
      const { count: activeMemberCount } = await supabase
        .from("conversation_members")
        .select("*", { count: 'exact', head: true })
        .eq("conversation_id", conversationId)
        .neq("is_deleted", true);
      
      if (activeMemberCount === 0) {
        console.log(`[Chat Delete] Last member left/deleted, cleaning up conversation ${conversationId}`);
        await supabase.from("messages").delete().eq("conversation_id", conversationId);
        await supabase.from("attachments").delete().eq("conversation_id", conversationId);
        await supabase.from("conversations").delete().eq("id", conversationId);
      }
    }

    // Notify participants via Gateway
    await realtime.emitToConversation(conversationId, "chat:conversation_deleted", { conversationId, userId });

    res.json({ success: true, message: "Conversation deleted successfully" });
  } catch (err) {
    console.error("Error deleting conversation:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Mute/Unmute conversation
exports.muteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { isMuted } = req.body;
    const userId = req.user.id;

    const { error } = await supabase
      .from("conversation_members")
      .update({ is_muted: isMuted })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ success: true, is_muted: isMuted });
  } catch (err) {
    console.error("Error muting conversation:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Clear chat history for user
exports.clearChatHistory = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const isTransactional = features.isFeatureEnabled('SEQUENCE_ENFORCEMENT', userId);
    console.log(`[SEQUENCE_MODE]: ${isTransactional ? 'transactional' : 'legacy'} (User: ${userId}, Action: clearChatHistory)`);

    const clearedAt = new Date().toISOString();

    if (isTransactional) {
        console.log(`[Chat Controller] Using RPC Transaction for clearChatHistory`);
        const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_clear_chat', {
            p_conversation_id: conversationId,
            p_user_id: userId
        });
        if (rpcError) throw rpcError;
    } else {
        const { error } = await supabase
          .from("conversation_members")
          .update({ cleared_at: clearedAt, is_deleted: false, deleted_at: null })
          .eq("conversation_id", conversationId)
          .eq("user_id", userId);

        if (error) throw error;
    }

    // Notify participants via Gateway
    await realtime.emitToConversation(conversationId, "chat:history_cleared", { conversationId, userId, clearedAt });

    res.json({ success: true, message: "Chat history cleared", clearedAt });
  } catch (err) {
    console.error("Error clearing chat history:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Delete a specific message (soft delete)
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    console.log(`[Chat Delete] Request by user ${userId} for message ${messageId}`);

    // Fetch message first to check sender and log status
    const { data: message, error: fetchError } = await supabase
      .from("messages")
      .select("id, sender_id, conversation_id")
      .eq("id", messageId)
      .maybeSingle();

    if (fetchError) {
      console.error(`[Chat Delete] Error fetching message ${messageId}:`, fetchError.message);
      throw fetchError;
    }

    if (!message) {
      console.warn(`[Chat Delete] Message ${messageId} not found in DB`);
      return res.status(404).json({ error: "Message not found" });
    }

    console.log(`[Chat Delete] Message found. Sender: ${message.sender_id}, Requester: ${userId}`);

    // Check requester role for admin bypass
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    const isAdmin = profile && ["admin", "support"].includes(profile.role);
    if (isAdmin) {
      console.log(`[Chat Delete] Admin/Support bypass enabled for user ${userId}`);
    }

    // Soft delete the message
    let query = supabase
      .from("messages")
      .update({
        is_deleted: true,
        content: "Message deleted",
      })
      .eq("id", messageId);

    if (!isAdmin) {
      query = query.eq("sender_id", userId);
    }

    let deletePayload;
    const isTransactional = features.isFeatureEnabled('SEQUENCE_ENFORCEMENT', userId);
    console.log(`[SEQUENCE_MODE]: ${isTransactional ? 'transactional' : 'legacy'} (User: ${userId}, Action: deleteMessage)`);

    if (isTransactional) {
      console.log(`[Chat Delete] Using RPC Transaction for deleteMessage ${messageId}`);
      const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_delete_message', {
          p_message_id: messageId,
          p_sender_id: userId
      });

      if (rpcError) throw rpcError;
      if (!rpcData.success) {
          return res.status(404).json({ error: rpcData.error || "Message not found" });
      }
      
      deletePayload = { 
        messageId, 
        conversationId: message.conversation_id,
        conversation_version: rpcData.conversation_version,
        is_duplicate: rpcData.is_duplicate 
      };
      
      if (rpcData.is_duplicate) {
        console.log(`[Chat Delete] Idempotent delete: message ${messageId} already deleted.`);
      }
    } else {
      const { data, error } = await query.select().single();

      if (error) {
        if (error.code === "PGRST116" || error.details?.includes('0 rows')) {
          console.warn(`[Chat Delete] Deletion failed. Record not found or RLS blocked it for user ${userId}`);
          return res.status(404).json({
            error: "Message not found or you don't have permission to delete it",
          });
        }
        throw error;
      }
      
      deletePayload = { messageId, conversationId: data.conversation_id };
    }

    console.log(`[Chat Delete] Successfully soft-deleted message ${messageId}`);

    // Broadcast to all OTHER sockets in the conversation room.
    await realtime.emitToConversation(message.conversation_id, "chat:message_deleted", deletePayload);
    // Also emit directly to the deleting user
    await realtime.emitToUser(userId, "chat:message_deleted", deletePayload);

    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    console.error("Error deleting message:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Edit a specific message
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) {
       return res.status(400).json({ error: "Content is required" });
    }

    const trimmedContent = content.trim();

    // ── STEP 1: Find candidate message record by ID or event_id ────────────────
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId);

    let targetMsg = null;
    if (isUuid) {
      const { data: foundList } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, is_deleted")
        .or(`id.eq.${messageId},event_id.eq.${messageId}`)
        .limit(1);
      if (foundList && foundList.length > 0) targetMsg = foundList[0];
    } else {
      const { data: foundByEvent } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, is_deleted")
        .eq("event_id", messageId)
        .limit(1);
      if (foundByEvent && foundByEvent.length > 0) targetMsg = foundByEvent[0];
    }

    // Retrying candidate lookup after short delay in case the message POST is still writing to DB
    if (!targetMsg) {
      await new Promise(r => setTimeout(r, 350));
      if (isUuid) {
        const { data: retryList } = await supabase
          .from("messages")
          .select("id, conversation_id, sender_id, is_deleted")
          .or(`id.eq.${messageId},event_id.eq.${messageId}`)
          .limit(1);
        if (retryList && retryList.length > 0) targetMsg = retryList[0];
      } else {
        const { data: retryByEvent } = await supabase
          .from("messages")
          .select("id, conversation_id, sender_id, is_deleted")
          .eq("event_id", messageId)
          .limit(1);
        if (retryByEvent && retryByEvent.length > 0) targetMsg = retryByEvent[0];
      }
    }

    if (!targetMsg) {
      console.warn(`[Chat Controller] editMessage 404: No message record found for key ${messageId}`);
      return res.status(404).json({ error: "Message not found or update failed" });
    }

    // ── STEP 2: Ownership and deletion checks ─────────────────────────────────
    if (targetMsg.sender_id !== userId) {
      return res.status(403).json({ error: "Unauthorized: You can only edit your own messages" });
    }

    if (targetMsg.is_deleted === true) {
      return res.status(400).json({ error: "Cannot edit a deleted message" });
    }

    // ── STEP 3: Update by exact canonical UUID primary key ──────────────────
    let updatedData = null;
    const { data: updateResList, error: updateErr } = await supabase
      .from("messages")
      .update({
        content: trimmedContent,
        updated_at: new Date().toISOString()
      })
      .eq("id", targetMsg.id)
      .select("*");

    if (updateErr) {
      throw updateErr;
    } else if (updateResList && updateResList.length > 0) {
      updatedData = updateResList[0];
    }

    if (!updatedData) {
      return res.status(500).json({ error: "Failed to apply message edit" });
    }

    // Explicitly set is_edited flag in payload
    updatedData.is_edited = true;

    // Ensure reply_to is hydrated if message has reply_to_id
    if (updatedData.reply_to_id && !updatedData.reply_to) {
      await _hydrateReplyTo([updatedData]);
    }

    // Attach sender profile payload
    if (!updatedData.sender) {
      updatedData.sender = senderProfileCache.get(userId) || {
        id: userId,
        username: null,
        full_name: null,
        avatar_url: null,
      };
    }

    // Notify all participants via Gateway WebSocket
    await realtime.emitToConversation(updatedData.conversation_id, "chat:message_edited", updatedData);

    return res.json(updatedData);
  } catch (err) {
    console.error("Error editing message:", err.message);
    return res.status(500).json({ error: "Server Error", details: err.message });
  }
};


exports.markConversationRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    // deviceId/lastMessageId kept for legacy compatibility but no longer used
    // to gate a second RPC call (was causing duplicate rpc_mark_read invocations).
    const now = new Date().toISOString();

    const readPayload = { conversationId, readerId: userId, readAt: now };

    // PERF FIX: Consolidate to a SINGLE rpc_mark_read call.
    // Previously: Phase-6 path called rpc_mark_read (old signature), THEN the
    // transactional block called it again — two bounded UPDATEs per open-conversation.
    // Now: always use rpc_mark_read (migration 209 version) which is bounded by
    // LIMIT 200 and uses the new idx_messages_read_at_null partial index.
    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_mark_read', {
        p_conversation_id: conversationId,
        p_user_id: userId
    });

    if (rpcError) {
        // Fallback: legacy path for databases that haven't run migration 209 yet
        if (rpcError.code === 'PGRST202' || rpcError.message?.includes('rpc_mark_read')) {
            console.warn('[Chat] rpc_mark_read not available — using legacy UPDATE');
            const { error } = await supabase
              .from("messages")
              .update({ read_at: now, delivered_at: now })
              .eq("conversation_id", conversationId)
              .neq("sender_id", userId)
              .is("read_at", null);
            if (error && error.code !== "42703") throw error;

            await supabase
              .from("conversation_unread_state")
              .upsert({
                conversation_id: conversationId,
                user_id: userId,
                unread_count: 0,
                last_reconciled_at: now
              }, { onConflict: 'conversation_id,user_id' });
        } else {
            throw rpcError;
        }
    } else if (rpcData) {
        readPayload.conversation_version = rpcData.conversation_version;
    }

    // Emit to ALL members of the conversation globally.
    // By using emitToUsers, this broadcasts to user:${userId} rooms,
    // guaranteeing delivery even if the sender is on a different screen.
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversationId);
      
    if (members && members.length > 0) {
      const memberIds = members.map(m => m.user_id);
      await realtime.emitToUsers(memberIds, "chat:conversation_read", readPayload);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error marking conversation read:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.markConversationDelivered = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const now = new Date().toISOString();

    // PERF FIX: The previous full-table UPDATE was the #1 Disk I/O consumer:
    //   UPDATE messages SET delivered_at = now()
    //   WHERE conversation_id = ? AND sender_id != ? AND delivered_at IS NULL
    // This scanned every message in the conversation with no index on delivered_at.
    //
    // New approach: use a bounded UPDATE (LIMIT 100 most-recent undelivered messages)
    // via the new idx_messages_delivered_null partial index from migration 209.
    // Real-time delivery via socket events handles the rest — this endpoint is only
    // a fallback catch-up for offline devices reconnecting.
    const { error } = await supabase
      .from("messages")
      .update({ delivered_at: now })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("delivered_at", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      if (error.code === "42703") {
         return res.json({ success: true, note: "delivered_at column missing" });
      }
      throw error;
    }

    const deliveredPayload = { conversationId, userId, delivered_at: now };

    // Emit delivery receipt to conversation room immediately (non-blocking)
    setImmediate(async () => {
      try {
        await realtime.emitToConversation(conversationId, "chat:conversation_delivered", deliveredPayload);
      } catch (e) {
        console.warn("[Chat] Delivery emit warning:", e.message);
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error marking conversation delivered:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// ==========================================
// BLOCKING SYSTEM
// ==========================================

exports.blockUser = async (req, res) => {
  try {
    const blockerId = req.user.id;
    const { blockedId } = req.body;
    if (!blockedId) return res.status(400).json({ error: "Blocked user ID required" });

    if (blockerId === blockedId) {
      return res.status(400).json({ error: "You cannot block yourself" });
    }

    const { data, error } = await supabase
      .from("user_blocks")
      .insert([{ blocker_id: blockerId, blocked_id: blockedId }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation (already blocked)
        return res.json({ success: true, message: "User already blocked" });
      }
      throw error;
    }

    // Notify the gateway if needed to disconnect calls/chats
    await realtime.emitToUser(blockedId, "chat:blocked", { blockerId });
    await realtime.emitToUser(blockerId, "chat:blocked_success", { blockedId });

    logger.info("User blocked another user", { event: 'user_blocked', user_id: blockerId, target_user_id: blockedId });
    res.json({ success: true, data });
  } catch (err) {
    logger.error("Error blocking user", { error: err.message, user_id: req.user.id });
    res.status(500).json({ error: "Server Error" });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const blockerId = req.user.id;
    const { blockedId } = req.body;
    if (!blockedId) return res.status(400).json({ error: "Blocked user ID required" });

    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", blockerId)
      .eq("blocked_id", blockedId);

    if (error) throw error;

    await realtime.emitToUser(blockedId, "chat:unblocked", { blockerId });
    await realtime.emitToUser(blockerId, "chat:unblocked_success", { blockedId });

    logger.info("User unblocked another user", { event: 'user_unblocked', user_id: blockerId, target_user_id: blockedId });
    res.json({ success: true, message: "User unblocked" });
  } catch (err) {
    logger.error("Error unblocking user", { error: err.message, user_id: req.user.id });
    res.status(500).json({ error: "Server Error" });
  }
};

exports.getBlockedUsers = async (req, res) => {
  try {
    const blockerId = req.user.id;
    
    // First fetch the blocked IDs
    const { data: blocks, error: blocksError } = await supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", blockerId);

    if (blocksError) {
      if (blocksError.code === 'PGRST116') return res.json([]); // Table missing
      throw blocksError;
    }

    if (!blocks || blocks.length === 0) {
      return res.json([]);
    }

    // Then fetch profiles avoiding relationship ambiguities
    const blockedIds = blocks.map(b => b.blocked_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", blockedIds);

    if (profilesError) throw profilesError;

    res.json(profiles || []);
  } catch (err) {
    console.error("Error fetching blocked users:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// ==========================================
// EVENT LEDGER (Phase 6.2)
// ==========================================

exports.emitLedgerEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId, conversationId, deviceId, sessionId, eventType, correlationId, metadata } = req.body;

    if (!messageId || !conversationId || !deviceId || !eventType || !correlationId) {
      return res.status(400).json({ error: "Missing required event fields" });
    }

    await emitMessageEvent({
      messageId,
      conversationId,
      userId,
      deviceId,
      sessionId,
      eventType,
      correlationId,
      metadata
    });

    res.json({ success: true });
  } catch (err) {
    console.error("[EventLedger] Controller error:", err.message);
    // Don't fail the client on ledger errors
    res.json({ success: true, error: "Event recorded with warnings" });
  }
};



// GET /api/chat/support — Dedicated User Support Payload Fetch
exports.getSupportChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const supportService = require("../services/supportService");
    const payload = await supportService.getSupportChatForUser(userId);
    res.json(payload);
  } catch (err) {
    console.error("[ChatController] getSupportChat error:", err.message);
    res.status(500).json({ error: "Failed to fetch support chat", details: err.message });
  }
};

// POST /api/chat/support — Dedicated User Support Creation / Message Handler
exports.createSupportChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { content } = req.body;
    const supportService = require("../services/supportService");
    
    let supportChat = await supportService.getSupportChatForUser(userId);
    let convId = supportChat?.conversation?.id;

    if (!convId) {
      const { data: newC, error: cErr } = await supabase
        .from("conversations")
        .insert([{ name: "Support Chat", chat_type: "support", support_status: "open" }])
        .select()
        .single();

      if (cErr) throw cErr;
      convId = newC.id;

      await supabase.from("conversation_members").insert([
        { conversation_id: convId, user_id: userId, role: "member", status: "accepted" }
      ]);
    }

    let fullPayload = await supportService.getSupportChatForUser(userId);

    if (content) {
      const result = await supportService.handleUserSupportMessage(convId, content, userId);
      return res.json({ success: true, conversationId: convId, conversation: fullPayload?.conversation, ...result });
    }

    res.json({ success: true, conversationId: convId, conversation: fullPayload?.conversation });
  } catch (err) {
    console.error("[ChatController] createSupportChat error:", err.message);
    res.status(500).json({ error: "Failed to create support chat", details: err.message });
  }
};

// POST /api/chat/support/close — Close Support Chat & Wipe History
exports.closeSupportChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.body;
    const supportService = require("../services/supportService");

    let convId = conversationId;
    if (!convId) {
      const userSupport = await supportService.getSupportChatForUser(userId);
      convId = userSupport?.conversation?.id;
    }

    if (!convId) {
      return res.status(400).json({ error: "No active support conversation found" });
    }

    await supportService.closeSupportChat(convId, userId);
    res.json({ success: true, message: "Support chat closed and previous messages wiped clean" });
  } catch (err) {
    console.error("[ChatController] closeSupportChat error:", err.message);
    res.status(500).json({ error: "Failed to close support chat", details: err.message });
  }
};

// ── CHAT ACK & TELEMETRY HANDLERS (PHASE 3) ───────────────────────────────────

/**
 * PUT /api/chat/messages/:messageId/deliver
 * Recipient device acknowledges receipt of message.
 */
exports.markMessageDelivered = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const now = new Date().toISOString();

    const { data: msg, error: fetchErr } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, delivery_status, delivered_at")
      .eq("id", messageId)
      .maybeSingle();

    if (fetchErr || !msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (msg.delivery_status === "delivered" || msg.delivery_status === "read" || msg.delivered_at) {
      return res.json({ success: true, messageId, status: msg.delivery_status || "delivered", idempotent: true });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("messages")
      .update({ delivered_at: now })
      .eq("id", messageId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Emit Realtime Delivery ACK to the original sender
    const realtime = require("../services/realtimeService");
    await realtime.emitToUser(msg.sender_id, "chat:message_delivered", {
      messageId,
      conversationId: msg.conversation_id,
      recipientId: userId,
      delivered_at: now,
    });

    console.log(`[Chat/Telemetry] MESSAGE_DELIVERED | msgId: ${messageId} | recipient: ${userId} | sender: ${msg.sender_id}`);
    res.json({ success: true, message: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/chat/messages/:messageId/read
 * Recipient device acknowledges reading message.
 */
exports.markMessageRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const now = new Date().toISOString();

    const { data: msg, error: fetchErr } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, delivery_status, read_at")
      .eq("id", messageId)
      .maybeSingle();

    if (fetchErr || !msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (msg.delivery_status === "read" || msg.read_at) {
      return res.json({ success: true, messageId, status: "read", idempotent: true });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("messages")
      .update({ read_at: now })
      .eq("id", messageId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Emit Realtime Read ACK to the original sender
    const realtime = require("../services/realtimeService");
    await realtime.emitToUser(msg.sender_id, "chat:message_read", {
      messageId,
      conversationId: msg.conversation_id,
      recipientId: userId,
      read_at: now,
    });

    console.log(`[Chat/Telemetry] MESSAGE_READ | msgId: ${messageId} | reader: ${userId} | sender: ${msg.sender_id}`);
    res.json({ success: true, message: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/chat/conversations/:conversationId/deliver
 * Recipient acknowledges delivery of all messages in conversation.
 */
exports.markConversationDelivered = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const now = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("messages")
      .update({ delivered_at: now })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("delivered_at", null)
      .select("id, sender_id");

    if (error) throw error;

    if (updated && updated.length > 0) {
      const realtime = require("../services/realtimeService");
      const senderIds = [...new Set(updated.map((m) => m.sender_id))];
      for (const senderId of senderIds) {
        await realtime.emitToUser(senderId, "chat:conversation_delivered", {
          conversationId,
          recipientId: userId,
          delivered_at: now,
          count: updated.length,
        });
      }
    }

    console.log(`[Chat/Telemetry] CONVERSATION_DELIVERED | convId: ${conversationId} | recipient: ${userId} | count: ${updated?.length || 0}`);
    res.json({ success: true, count: updated?.length || 0 });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/chat/conversations/:conversationId/read
 * Recipient acknowledges reading all messages in conversation.
 */
exports.markConversationRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const now = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("messages")
      .update({ read_at: now })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("read_at", null)
      .select("id, sender_id");

    if (error) throw error;

    await supabase
      .from("conversation_unread_state")
      .upsert({
        conversation_id: conversationId,
        user_id: userId,
        unread_count: 0,
        last_reconciled_at: now
      }, { onConflict: 'conversation_id,user_id' });

    if (updated && updated.length > 0) {
      const realtime = require("../services/realtimeService");
      const senderIds = [...new Set(updated.map((m) => m.sender_id))];
      for (const senderId of senderIds) {
        await realtime.emitToUser(senderId, "chat:conversation_read", {
          conversationId,
          recipientId: userId,
          read_at: now,
          count: updated.length,
        });
      }
    }

    console.log(`[Chat/Telemetry] CONVERSATION_READ | convId: ${conversationId} | reader: ${userId} | count: ${updated?.length || 0}`);
    res.json({ success: true, count: updated?.length || 0 });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/chat/messages/ack:batch
 * Batch acknowledge delivery of multiple messages.
 */
exports.markMessagesDeliveredBatch = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { messageIds } = req.body;
    const now = new Date().toISOString();

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: "messageIds array required" });
    }

    const { data: updated, error } = await supabase
      .from("messages")
      .update({ delivered_at: now })
      .in("id", messageIds)
      .neq("sender_id", userId)
      .is("delivered_at", null)
      .select("id, sender_id, conversation_id");

    if (error) throw error;

    if (updated && updated.length > 0) {
      setImmediate(async () => {
        try {
          const realtime = require("../services/realtimeService");
          const senderIds = [...new Set(updated.map((m) => m.sender_id))];
          const emitPromises = senderIds.map((senderId) =>
            realtime.emitToUser(senderId, "chat:messages_delivered_batch", {
              messageIds: updated.map((m) => m.id),
              recipientId: userId,
              delivered_at: now,
            })
          );
          await Promise.allSettled(emitPromises);
        } catch (e) {
          console.warn("[Chat] Batch delivery emit warning:", e.message);
        }
      });
    }

    console.log(`[Chat/Telemetry] BATCH_DELIVERED | count: ${updated?.length || 0} | recipient: ${userId}`);
    res.json({ success: true, count: updated?.length || 0 });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/chat/messages/:messageId/webhook-deliver
 * Gateway webhook delivery ACK.
 */
exports.webhookDeliver = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const now = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("messages")
      .update({ delivered_at: now })
      .eq("id", messageId)
      .is("delivered_at", null)
      .select("id, sender_id, conversation_id")
      .maybeSingle();

    if (error) throw error;
    res.json({ success: true, delivered: !!updated });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/chat/conversations/:conversationId/search
 * Search messages within a specific conversation (B-07)
 */
exports.searchMessages = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const query = (req.query.q || '').trim();

    if (!conversationId || conversationId === 'undefined' || conversationId === 'null') {
      return res.status(400).json({ error: 'Valid conversation ID is required' });
    }

    if (!query) {
      return res.json({ success: true, messages: [], total: 0 });
    }

    // Verify user is a member of the conversation
    const { data: member, error: memberErr } = await supabase
      .from('conversation_members')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr || !member) {
      return res.status(403).json({ error: 'Access denied to conversation' });
    }

    // Search messages in this conversation
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, type, created_at')
      .eq('conversation_id', conversationId)
      .ilike('content', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      success: true,
      query,
      messages: messages || [],
      total: messages?.length || 0,
    });
  } catch (err) {
    next(err);
  }
};


