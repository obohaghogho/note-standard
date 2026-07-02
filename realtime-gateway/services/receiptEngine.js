/**
 * receiptEngine.js — v2 Message State Machine
 *
 * THE SOLE OWNER of message delivery state transitions.
 * Nothing else in the codebase should write delivered_at or read_at.
 *
 * State machine:
 *   SENT  →  DELIVERED  →  READ
 *   (created_at)  (delivered_at)  (read_at)
 *
 * Invariant: the database is always authoritative.
 * If socket says DELIVERED but DB says SENT, the message is SENT.
 *
 * Every transition is idempotent. Calling markDelivered twice is a no-op.
 */

/**
 * Transition: SENT → DELIVERED
 *
 * @param {object} supabase - Supabase client
 * @param {object} io       - Socket.IO server instance
 * @param {string} messageId
 * @returns {{ updated: boolean, message: object|null }}
 */
async function markDelivered(supabase, io, messageId) {
  if (!messageId || !supabase) return { updated: false, message: null };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('messages')
    .update({ delivered_at: now })
    .eq('id', messageId)
    .is('delivered_at', null)
    .select('id, conversation_id, sender_id, event_id, delivered_at, created_at')
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows matched (already delivered) — idempotent, not an error
    if (error.code !== 'PGRST204') {
      console.warn('[ReceiptEngine] markDelivered DB error:', error.message);
    }
    return { updated: false, message: null };
  }

  if (!data) return { updated: false, message: null };

  // Emit receipt to sender
  const receipt = {
    messageId: data.id,
    eventId: data.event_id,
    conversationId: data.conversation_id,
    userId: data.sender_id,
    delivered_at: data.delivered_at,
  };

  io.to(`user:${data.sender_id}`).emit('chat:message_delivered', receipt);
  io.to(data.conversation_id).emit('chat:message_delivered', receipt);

  console.log(`[ReceiptEngine] DELIVERED | messageId:${messageId} | sender:${data.sender_id} | conv:${data.conversation_id}`);
  return { updated: true, message: data };
}

/**
 * Transition: DELIVERED → READ (batch)
 *
 * @param {object} supabase
 * @param {object} io
 * @param {string} conversationId
 * @param {string} readerId        - the user who read the messages
 * @param {string[]} messageIds
 * @returns {{ updatedCount: number }}
 */
async function markRead(supabase, io, conversationId, readerId, messageIds) {
  if (!conversationId || !readerId || !messageIds?.length || !supabase) {
    return { updatedCount: 0 };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('messages')
    .update({ read_at: now })
    .in('id', messageIds)
    .is('read_at', null)
    .neq('sender_id', readerId)
    .select('id, sender_id');

  if (error) {
    console.warn('[ReceiptEngine] markRead DB error:', error.message);
    return { updatedCount: 0 };
  }

  if (!data || data.length === 0) return { updatedCount: 0 };

  const receipt = {
    conversationId,
    messageIds: data.map(m => m.id),
    readAt: now,
    userId: readerId,
  };

  // Notify all senders
  const senderIds = [...new Set(data.map(m => m.sender_id))];
  senderIds.forEach(senderId => {
    io.to(`user:${senderId}`).emit('chat:read_receipt', receipt);
  });
  io.to(conversationId).emit('chat:read_receipt', receipt);

  console.log(`[ReceiptEngine] READ | conv:${conversationId} | reader:${readerId} | count:${data.length}`);
  return { updatedCount: data.length };
}

/**
 * Batch transition: SENT → DELIVERED (for reconnect sync)
 *
 * @param {object} supabase
 * @param {object} io
 * @param {string[]} messageIds
 * @param {string} recipientId - the user who received the messages
 * @returns {{ updatedCount: number }}
 */
async function markDeliveredBatch(supabase, io, messageIds, recipientId) {
  if (!messageIds?.length || !supabase) return { updatedCount: 0 };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('messages')
    .update({ delivered_at: now })
    .in('id', messageIds)
    .neq('sender_id', recipientId)
    .is('delivered_at', null)
    .select('id, conversation_id, sender_id, event_id');

  if (error) {
    console.warn('[ReceiptEngine] markDeliveredBatch DB error:', error.message);
    return { updatedCount: 0 };
  }

  if (!data || data.length === 0) return { updatedCount: 0 };

  // Group by sender+conversation and emit batch receipts
  const groups = {};
  data.forEach(msg => {
    const key = `${msg.sender_id}:${msg.conversation_id}`;
    if (!groups[key]) groups[key] = { senderId: msg.sender_id, conversationId: msg.conversation_id, ids: [] };
    groups[key].ids.push(msg.id);
  });

  Object.values(groups).forEach(({ senderId, conversationId, ids }) => {
    const receipt = { conversationId, messageIds: ids, userId: recipientId, delivered_at: now };
    io.to(`user:${senderId}`).emit('chat:messages_delivered_batch', receipt);
    io.to(conversationId).emit('chat:messages_delivered_batch', receipt);
  });

  console.log(`[ReceiptEngine] DELIVERED_BATCH | count:${data.length} | recipient:${recipientId}`);
  return { updatedCount: data.length };
}

module.exports = { markDelivered, markRead, markDeliveredBatch };
