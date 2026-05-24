const { supabase } = require('../config/supabase');

/**
 * Register a new device session
 * RPC: rpc_register_device_session
 */
async function registerDeviceSession({
  userId,
  deviceId,
  ipAddress,
  userAgent
}) {
  const { data, error } = await supabase.rpc('rpc_register_device_session', {
    p_user_id: userId,
    p_device_id: deviceId,
    p_ip: ipAddress || null,
    p_user_agent: userAgent || null
  });

  if (error) throw new Error(`registerDeviceSession: ${error.message}`);
  return data; // { session_id }
}

/**
 * Heartbeat + lease arbitration
 * RPC: rpc_session_heartbeat
 */
async function heartbeatSession({
  sessionId
}) {
  const { data, error } = await supabase.rpc('rpc_session_heartbeat', {
    p_session_id: sessionId
  });

  if (error) throw new Error(`heartbeatSession: ${error.message}`);
  return data;
}

/**
 * Fetch conversation leases for UI sync
 * RPC: rpc_get_conversations
 */
async function getConversationLeases({
  userId
}) {
  const { data, error } = await supabase.rpc('rpc_get_conversations', {
    p_user_id: userId
  });

  if (error) throw new Error(`getConversationLeases: ${error.message}`);
  return data;
}

/**
 * Force lease takeover (used when sendMessage indicates active intent)
 * RPC: force_takeover_lease
 */
async function forceTakeoverLease({
  conversationId,
  sessionId,
  deviceId
}) {
  const { data, error } = await supabase.rpc('force_takeover_lease', {
    p_conversation_id: conversationId,
    p_session_id: sessionId,
    p_device_id: deviceId
  });

  if (error) throw new Error(`forceTakeoverLease: ${error.message}`);
  return data;
}

/**
 * Optional: cleanup stale sessions (can be cron-triggered)
 * RPC: cleanup_stale_sessions
 */
async function cleanupStaleSessions() {
  const { data, error } = await supabase.rpc('cleanup_stale_sessions', {});

  if (error) throw new Error(`cleanupStaleSessions: ${error.message}`);
  return data;
}

module.exports = {
  registerDeviceSession,
  heartbeatSession,
  getConversationLeases,
  forceTakeoverLease,
  cleanupStaleSessions
};
