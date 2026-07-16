const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

/**
 * Helper to fetch user with retry logic for Supabase Auth
 * Mitigates transient network/service availability issues
 */
const getUserWithRetry = async (token, maxAttempts = 3) => {
  if (!supabase) return { data: { user: null }, error: { message: "Supabase client not initialized" } };
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser(token);

      if (!error) return { data, error };

      // Identify definitively non-retryable errors
      const msg = error.message?.toLowerCase() || "";
      const isAuthError = 
        (error.status && error.status !== 500 && error.status !== 0) ||
        msg.includes("invalid") ||
        msg.includes("missing") ||
        msg.includes("expired") ||
        msg.includes("not found");

      if (isAuthError) return { data, error };

      lastError = error;
      console.warn(`[Auth] Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
    } catch (err) {
      lastError = err;
      console.warn(`[Auth] Attempt ${attempt}/${maxAttempts} threw: ${err.message}`);
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 500));
    }
  }

  return { data: { user: null }, error: lastError || { message: "Auth service unavailable" } };
};

const authMiddleware = async (socket, next) => {
  try {
    if (!supabase) {
      console.warn(`[Auth] ✗ Connection rejected: Supabase client not initialized`);
      return next(new Error('Authentication error: Supabase client not initialized'));
    }
    const token = socket.handshake.auth.token;
    const sessionId = socket.handshake.auth.sessionId;
    const deviceId = socket.handshake.auth.deviceId;
    
    // 1. Initial validation
    if (!token || typeof token !== 'string' || token.trim() === '' || token === 'undefined' || token === 'null' || token.length < 10) {
      console.warn(`[Auth] ✗ Connection rejected: Malformed token '${token}'`);
      return next(new Error('Authentication error: Token missing or malformed'));
    }

    if (!sessionId || !deviceId) {
      console.warn(`[Auth] ✗ Connection rejected: Missing sessionId or deviceId`);
      return next(new Error('Authentication error: Session ID and Device ID required'));
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from('user_sessions')
      .select('token_state, user_id, device_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionData && sessionData.token_state !== 'valid') {
      console.warn(`[Auth Forensic] ✗ Connection rejected: Session ${sessionId} has token_state='${sessionData.token_state}'`);
      return next(new Error('Authentication error: Session is invalid or revoked'));
    }

    if (sessionData && sessionData.device_id !== deviceId) {
      console.warn(`[Auth Forensic] ⚠ Device mismatch! Expected '${sessionData.device_id}', got '${deviceId}'. Proceeding to JWT verification as a fallback.`);
    }

    if (!sessionData) {
      console.warn(`[Auth Forensic] ⚠ Session ${sessionId} NOT FOUND in database. Proceeding to JWT verification as a fallback.`);
    }

    // 3. Verify token with Supabase (with retry logic)
    const { data: { user }, error } = await getUserWithRetry(token);

    if (error || !user) {
      const msg = error?.message || 'Invalid user';
      console.error(`[Auth] ✗ JWT verification failed: ${msg}`);
      
      if (msg.includes('Auth session missing') || msg.includes('expired')) {
        return next(new Error('Authentication error: Session expired or missing'));
      }
      return next(new Error(`Authentication error: ${msg}`));
    }

    // Attach user info to socket
    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.sessionId = sessionId;
    socket.deviceId = deviceId;

    // Fetch profile info for UI (calls, etc.)
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', user.id)
      .single();

    socket.userName = profile?.full_name || profile?.username || user.email.split('@')[0];
    socket.userAvatar = profile?.avatar_url || null;
    
    console.log(`[Auth] User authenticated: ${user.id} (${socket.userName}) on session: ${sessionId}`);
    next();
  } catch (err) {
    console.error('[Auth] Internal error:', err.message);
    next(new Error('Authentication error: Internal server error'));
  }
};

module.exports = { authMiddleware };
