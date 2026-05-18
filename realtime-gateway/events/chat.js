/**
 * Chat Event Handler — NoteStandard Realtime Gateway
 *
 * Pure relay layer — the gateway NEVER writes to the database.
 * All persistence happens on the API server via /api/chat.
 * The gateway only relays events to the correct socket rooms.
 *
 * Events handled:
 *  join_room / chat:join / team:join   — room membership
 *  chat:typing / stop_typing           — typing indicators
 *  chat:read                           — read receipts
 *  chat:delivered                      — delivery confirmation
 *  chat:message                        — relay new messages (sent via API, echoed here)
 *  chat:message_deleted                — deletion relay
 *  chat:message_edited                 — edit relay
 *  chat:reaction                       — emoji reaction relay
 *  chat:pin                            — pin/unpin relay
 */

// ── Production Hardening: Sliding-Window Rate Limiter Shield ─────────────────
const rateLimits = new Map();

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  if (!rateLimits.has(key)) {
    rateLimits.set(key, [now]);
    return true;
  }
  const timestamps = rateLimits.get(key).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  rateLimits.set(key, timestamps);
  return true;
}

module.exports = (io, socket) => {
  const userId = socket.userId;

  // ── Room Management ──────────────────────────────────────────────────────

  // Legacy alias
  socket.on('join_room', (roomId) => {
    if (!roomId) return;
    socket.join(roomId);
    console.log(`[Chat] User ${userId} joined room: ${roomId}`);
  });

  // Direct conversation join
  socket.on('chat:join', (roomId) => {
    if (!roomId) return;
    socket.join(roomId);
    console.log(`[Chat] User ${userId} joined chat room: ${roomId}`);
  });

  // Team/group chat join
  socket.on('team:join', (teamId) => {
    if (!teamId) return;
    socket.join(teamId);
    console.log(`[Chat] User ${userId} joined team room: ${teamId}`);
  });

  // Leave a room explicitly
  socket.on('chat:leave', (roomId) => {
    if (!roomId) return;
    socket.leave(roomId);
    console.log(`[Chat] User ${userId} left room: ${roomId}`);
  });

  // ── Typing Indicators ───────────────────────────────────────────────────

  socket.on('typing', (data) => {
    const room = data?.teamId || data?.conversationId;
    if (!room) return;

    // Production Hardening: Sliding window rate limit: max 6 events per 10 seconds per user
    if (!checkRateLimit(`chat_typing:${userId}`, 6, 10000)) {
      return; // drop silently
    }

    socket.to(room).emit('chat:typing', {
      userId,
      username:       data.username || null,
      isTyping:       true,
      conversationId: data.conversationId || null,
      teamId:         data.teamId || null,
    });
  });

  socket.on('stop_typing', (data) => {
    const room = data?.teamId || data?.conversationId;
    if (!room) return;
    socket.to(room).emit('chat:typing', {
      userId,
      username:       data.username || null,
      isTyping:       false,
      conversationId: data.conversationId || null,
      teamId:         data.teamId || null,
    });
  });

  // ── Read Receipts ────────────────────────────────────────────────────────

  // Emitted by client when messages are seen.
  // Payload: { conversationId, messageIds: string[], readAt: ISO string }
  socket.on('chat:read', (data) => {
    const { conversationId, messageIds, readAt } = data || {};
    if (!conversationId || !Array.isArray(messageIds) || messageIds.length === 0) return;

    // Relay to everyone else in the conversation room
    socket.to(conversationId).emit('chat:read_receipt', {
      userId,
      conversationId,
      messageIds,
      readAt: readAt || new Date().toISOString(),
    });
  });

  // ── Delivery Receipts ────────────────────────────────────────────────────

  // Emitted by client when a message is received (device received it).
  // Payload: { conversationId, messageId, deliveredAt: ISO string }
  socket.on('chat:delivered', (data) => {
    const { conversationId, messageId, deliveredAt } = data || {};
    if (!conversationId || !messageId) return;

    socket.to(conversationId).emit('chat:delivery_receipt', {
      userId,
      conversationId,
      messageId,
      deliveredAt: deliveredAt || new Date().toISOString(),
    });
  });

  // ── Message Relay (new messages sent via API, echoed here) ──────────────
  // The API server calls pg_notify → gateway receives → relays to room.
  // Clients may also emit this for optimistic UI, but the DB write
  // always happens server-side. This is the relay path.
  socket.on('chat:message', (data) => {
    const { conversationId, teamId, message } = data || {};
    const room = teamId || conversationId;
    if (!room || !message) return;

    // Relay to everyone else in the room (not back to sender)
    socket.to(room).emit('chat:new_message', {
      ...message,
      senderId: userId, // always use authenticated userId, not client-provided
    });
  });

  // ── Message Deleted ──────────────────────────────────────────────────────

  // Payload: { conversationId, teamId, messageId }
  socket.on('chat:message_deleted', (data) => {
    const { conversationId, teamId, messageId } = data || {};
    const room = teamId || conversationId;
    if (!room || !messageId) return;

    socket.to(room).emit('chat:message_deleted', {
      userId,
      conversationId: conversationId || null,
      teamId:         teamId || null,
      messageId,
      deletedAt:      new Date().toISOString(),
    });
  });

  // ── Message Edited ───────────────────────────────────────────────────────

  // Payload: { conversationId, teamId, messageId, newContent }
  socket.on('chat:message_edited', (data) => {
    const { conversationId, teamId, messageId, newContent } = data || {};
    const room = teamId || conversationId;
    if (!room || !messageId || !newContent) return;

    socket.to(room).emit('chat:message_edited', {
      userId,
      conversationId: conversationId || null,
      teamId:         teamId || null,
      messageId,
      newContent,
      editedAt:       new Date().toISOString(),
    });
  });

  // ── Reactions ────────────────────────────────────────────────────────────

  // Payload: { conversationId, teamId, messageId, emoji }
  socket.on('chat:reaction', (data) => {
    const { conversationId, teamId, messageId, emoji } = data || {};
    const room = teamId || conversationId;
    if (!room || !messageId || !emoji) return;

    socket.to(room).emit('chat:reaction', {
      userId,
      messageId,
      emoji,
      conversationId: conversationId || null,
      teamId:         teamId || null,
    });
  });

  // ── Pin / Unpin ───────────────────────────────────────────────────────────

  // Payload: { conversationId, teamId, messageId, pinned: boolean }
  socket.on('chat:pin', (data) => {
    const { conversationId, teamId, messageId, pinned } = data || {};
    const room = teamId || conversationId;
    if (!room || !messageId) return;

    socket.to(room).emit('chat:pin_update', {
      userId,
      messageId,
      pinned: Boolean(pinned),
      conversationId: conversationId || null,
      teamId:         teamId || null,
    });
  });

  // ── Voice Note Progress ───────────────────────────────────────────────────

  // Relay audio playback position for shared voice note UX
  socket.on('chat:voice_progress', (data) => {
    const { conversationId, messageId, progress } = data || {};
    if (!conversationId || !messageId) return;
    socket.to(conversationId).emit('chat:voice_progress', {
      userId,
      messageId,
      progress,
    });
  });
};
