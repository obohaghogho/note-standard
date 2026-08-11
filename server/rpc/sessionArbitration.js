const supabase = require('../config/supabase');

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
  try {
    const { data, error } = await supabase.rpc('register_device_session', {
      p_user_id: userId,
      p_device_id: deviceId,
      p_ip_address: ipAddress || null,
      p_user_agent: userAgent || null
    });

    if (!error && data?.session_id) {
      return data;
    }
  } catch (rpcErr) {
    console.warn('[Session] RPC register_device_session failed, using fallback:', rpcErr.message);
  }

  // Fallback: Generate valid session UUID and upsert into device_sessions table directly
  const crypto = require('crypto');
  const session_id = crypto.randomUUID();
  try {
    await supabase.from('device_sessions').upsert({
      user_id: userId,
      device_id: deviceId,
      session_id,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      last_seen_at: new Date().toISOString(),
      is_active: true
    }, { onConflict: 'user_id,device_id' });
  } catch (tableErr) {
    console.warn('[Session] Direct table upsert warning:', tableErr.message);
  }

  return { session_id };
}

/**
 * Heartbeat + lease arbitration
 * RPC: rpc_session_heartbeat
 */
async function heartbeatSession({
  sessionId,
  deviceId,
  conversationIds
}) {
  const { data, error } = await supabase.rpc('heartbeat_device_session', {
    p_session_id: sessionId,
    p_device_id: deviceId,
    p_active_conversations: conversationIds || []
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
