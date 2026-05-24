const supabase = require('../config/supabase');

/**
 * Emit an immutable message event to the Event Ledger (message_events)
 * @param {Object} params
 * @param {string} params.messageId
 * @param {string} params.conversationId
 * @param {string} params.userId
 * @param {string} params.deviceId
 * @param {string} params.sessionId
 * @param {string} params.eventType - 'SENT' | 'DELIVERED' | 'READ' | 'LEASE_TAKEN' | 'LEASE_RELEASED' | 'RETRY' | 'FAILED'
 * @param {string} params.correlationId
 * @param {Object} [params.metadata]
 */
async function emitMessageEvent({
  messageId,
  conversationId,
  userId,
  deviceId,
  sessionId,
  eventType,
  correlationId,
  metadata = {}
}) {
  try {
    const { error } = await supabase.rpc('rpc_emit_message_event', {
      p_message_id: messageId,
      p_conversation_id: conversationId,
      p_user_id: userId,
      p_device_id: deviceId,
      p_session_id: sessionId || null,
      p_event_type: eventType,
      p_correlation_id: correlationId,
      p_metadata: metadata
    });

    if (error) {
      console.warn(`[EventLedger] Failed to emit ${eventType} event:`, error.message);
      // Non-fatal, do not throw. Event Ledger should not break core workflows.
    }
  } catch (err) {
    console.warn(`[EventLedger] Exception emitting ${eventType} event:`, err.message);
  }
}

module.exports = {
  emitMessageEvent
};
