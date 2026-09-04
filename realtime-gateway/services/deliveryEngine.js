/**
 * deliveryEngine.js — v2 Message Delivery Orchestrator
 *
 * The SOLE authority for delivery decisions. The API server does not
 * make any delivery, push, or presence decisions — it only saves
 * messages and fires pg_notify. This module handles everything else.
 *
 * Flow:
 *   1. pg_notify fires with chat:message
 *   2. This module checks: does the recipient have a connected socket?
 *   3. YES → message was already emitted by dispatchSocketEvent.
 *      Set a 3-second ACK timeout (configurable). If no 'chat:delivered' within 3s → push.
 *   4. NO → send push immediately via chatPush.
 *
 * The ACK timeout prevents a race where:
 *   - socket exists
 *   - user lost internet
 *   - gateway thinks they're online
 *   - push never gets sent
 *
 * Dependencies:
 *   - receiptEngine.js (state transitions)
 *   - chatPush.js (push notifications)
 */

const receiptEngine = require('./receiptEngine');
const chatPush = require('./chatPush');

// Track pending delivery ACKs: Map<messageId, { timer, recipientId, conversationId }>
const pendingAcks = new Map();

// Configurable timeout (ms) before falling back to push.
// 3000ms default gives React/ChatContext enough time to mount
// and send 'chat:delivered' before we fall back to a push notification.
// This prevents the "first message no push" race condition where the
// ACK timeout fired before the client's socket handler was registered.
const ACK_TIMEOUT_MS = parseInt(process.env.MESSAGE_ACK_TIMEOUT_MS || process.env.DELIVERY_ACK_TIMEOUT_MS || '3000', 10);

/**
 * Telemetry Helpers
 */
async function logInitialTelemetry(supabase, messageId, recipientId, socketsCount) {
  try {
    await supabase.from('push_delivery_telemetry').insert({
      message_id: messageId,
      recipient_id: recipientId,
      socket_present: socketsCount > 0,
      push_sent: false,
      routing_engine_version: 'v2-messaging',
      routing_decision: socketsCount > 0 ? 'SOCKET_FIRST' : 'PUSH_IMMEDIATE',
      active_socket_count: socketsCount,
      fallback_used: false,
      delivery_ack_received: false
    });
  } catch (err) {
    console.error('[DeliveryEngine] Telemetry initial insert failed:', err.message);
  }
}

async function updateTelemetryFallback(supabase, messageId, recipientId) {
  try {
    await supabase.from('push_delivery_telemetry')
      .update({
        fallback_used: true,
        push_sent: true,
        routing_decision: 'PUSH_FALLBACK',
        reason: 'SOCKET_TIMEOUT_FALLBACK'
      })
      .eq('message_id', messageId)
      .eq('recipient_id', recipientId);
  } catch (err) {
    console.error('[DeliveryEngine] Telemetry fallback update failed:', err.message);
  }
}

async function updateTelemetryAck(supabase, messageId, recipientId, ackLatencyMs) {
  try {
    await supabase.from('push_delivery_telemetry')
      .update({
        delivery_ack_received: true,
        ack_latency_ms: ackLatencyMs
      })
      .eq('message_id', messageId)
      .eq('recipient_id', recipientId);
  } catch (err) {
    console.error('[DeliveryEngine] Telemetry ACK update failed:', err.message);
  }
}

/**
 * Called by the gateway when a chat:message event arrives via pg_notify.
 * The socket emit has ALREADY happened (dispatchSocketEvent runs first).
 * This function decides whether push is also needed.
 *
 * @param {object} io       - Socket.IO server
 * @param {object} supabase - Supabase client
 * @param {object} envelope - The pg_notify payload { event, payload, users, ... }
 * @param {object} deps     - { firebaseApp, gatewayUrl }
 */
async function processIncomingMessage(io, supabase, envelope, deps = {}) {
  const msg = envelope.payload;
  if (!msg?.id || !msg?.conversation_id || !msg?.sender_id) return;

  const messageId = msg.id;
  const conversationId = msg.conversation_id;
  const senderId = msg.sender_id;

  // Determine recipients: everyone in the conversation except the sender
  let recipientIds = (envelope.users || []).filter(uid => uid !== senderId);

  if (recipientIds.length === 0) {
    try {
      const { data: members } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversationId);

      if (members && members.length > 0) {
        recipientIds = members.map(m => m.user_id).filter(uid => uid !== senderId);
      } else {
        // Fallback retry window for first message race condition
        await new Promise(r => setTimeout(r, 250));
        const { data: retryMembers } = await supabase
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', conversationId);
        if (retryMembers && retryMembers.length > 0) {
          recipientIds = retryMembers.map(m => m.user_id).filter(uid => uid !== senderId);
        }
      }
    } catch (dbErr) {
      console.error(`[DeliveryEngine] Error fetching conversation members for ${conversationId}:`, dbErr.message);
    }
  }

  if (recipientIds.length === 0) {
    console.warn(`[DeliveryEngine] ⚠️ No recipients resolved for message ${messageId} (conversation ${conversationId}). Skipping push.`);
    return;
  }

  for (const recipientId of recipientIds) {
    const sockets = await io.in(`user:${recipientId}`).fetchSockets();
    const socketsCount = sockets.length;

    // Log the initial delivery state trace (non-blocking)
    logInitialTelemetry(supabase, messageId, recipientId, socketsCount).catch(err => {
      console.error('[DeliveryEngine] Background telemetry initial insert failed:', err.message);
    });

    console.log(`[DeliveryEngine] Dispatching Push | msgId:${messageId.slice(0, 8)} | recipient:${recipientId.slice(0, 8)} | sender:${senderId.slice(0, 8)} | sockets:${socketsCount}`);

    // Always dispatch push notification. The client-side Service Worker (sw.js) or FCM handler
    // will deduplicate and display the OS desktop popup if the user is in background, locked, or on another page.
    chatPush.sendChatPush({
      supabase,
      firebaseApp: deps.firebaseApp || null,
      userId: recipientId,
      title: msg.sender?.full_name || msg.sender?.username || 'New Message',
      body: getPreview(msg.type, msg.content),
      messageId,
      conversationId,
      gatewayUrl: deps.gatewayUrl || process.env.SELF_URL || 'https://realtime-gateway-gsb5.onrender.com',
    }).catch(pushErr => {
      console.error('[DeliveryEngine] Error sending chat push:', pushErr.message);
    });
  }
  }
}

/**
 * Called when a delivery ACK is received (socket 'chat:delivered' or HTTP /deliver/:id).
 * Clears any pending ACK timeout and writes the state transition via receiptEngine.
 *
 * @param {object} supabase
 * @param {object} io
 * @param {string} messageId
 * @param {string} recipientId
 */
async function handleDeliveryAck(supabase, io, messageId, recipientId) {
  // 1. Cancel pending push timeout
  if (recipientId) {
    const ackKey = `${messageId}:${recipientId}`;
    const pending = pendingAcks.get(ackKey);
    if (pending) {
      clearTimeout(pending.timer);
      pendingAcks.delete(ackKey);
    }
  } else {
    // If recipientId is not provided, clear any timers for this messageId
    pendingAcks.forEach((val, key) => {
      if (key.startsWith(`${messageId}:`)) {
        clearTimeout(val.timer);
        pendingAcks.delete(key);
      }
    });
  }

  // 2. Write state transition (idempotent)
  const result = await receiptEngine.markDelivered(supabase, io, messageId);

  // 3. Update telemetry details
  let msg = result.message;
  if (!msg) {
    // If already delivered, fetch created_at and delivered_at for latency calculation
    try {
      const { data } = await supabase
        .from('messages')
        .select('created_at, delivered_at')
        .eq('id', messageId)
        .single();
      msg = data;
    } catch (e) {
      // Ignore error if message cannot be fetched
    }
  }

  if (recipientId && msg) {
    const latency = msg.created_at && msg.delivered_at
      ? (new Date(msg.delivered_at).getTime() - new Date(msg.created_at).getTime())
      : null;
    await updateTelemetryAck(supabase, messageId, recipientId, latency);
  }

  return result;
}

/**
 * Generate notification preview text from message type/content.
 */
function getPreview(type, content) {
  switch (type) {
    case 'audio': case 'voice': return '🎤 Voice message';
    case 'image': return '📷 Photo';
    case 'video': return '🎥 Video';
    case 'document': case 'file': return '📄 Document';
    default: return content || 'You have a new message';
  }
}

/**
 * Cleanup: call on process exit to clear all pending timers.
 */
function shutdown() {
  pendingAcks.forEach(({ timer }) => clearTimeout(timer));
  pendingAcks.clear();
}

module.exports = { processIncomingMessage, handleDeliveryAck, shutdown };
