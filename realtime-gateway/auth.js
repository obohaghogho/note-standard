const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || "https://tngcvgisfctggvivcnva.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Helper to fetch user with retry logic for Supabase Auth
 * Mitigates transient network/service availability issues
 */
const getUserWithRetry = async (token, maxAttempts = 2) => {
  // 1. Ultra-fast path: Verify JWT locally if secret is present
  if (JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && (decoded.sub || decoded.id)) {
        return {
          data: {
            user: {
              id: decoded.sub || decoded.id,
              email: decoded.email || 'user@notestandard.test',
              user_metadata: decoded.user_metadata || {}
            }
          },
          error: null
        };
      }
    } catch (err) {
      // Local verification failed, fallback to remote
    }
  }

  if (!supabase) return { data: { user: null }, error: { message: "Supabase client not initialized" } };
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser(token);

      if (!error) return { data, error };

      const msg = error.message?.toLowerCase() || "";
      const isAuthError = 
        (error.status && error.status !== 500 && error.status !== 0) ||
        msg.includes("invalid") ||
        msg.includes("missing") ||
        msg.includes("expired") ||
        msg.includes("not found");

      if (isAuthError) return { data, error };

      lastError = error;
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return { data: { user: null }, error: lastError || { message: "Auth service unavailable" } };
};

const authMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const sessionId = socket.handshake.auth?.sessionId || socket.handshake.query?.sessionId || `session_${socket.id}`;
    const deviceId = socket.handshake.auth?.deviceId || socket.handshake.query?.deviceId || `device_${socket.id}`;
    
    // 1. Initial validation
    if (!token || typeof token !== 'string' || token.trim() === '' || token === 'undefined' || token === 'null' || token.length < 10) {
      return next(new Error('Authentication error: Token missing or malformed'));
    }

    // 2. Verify token (ultra fast local verification + remote fallback)
    const { data: { user }, error } = await getUserWithRetry(token);

    if (error || !user) {
      const msg = error?.message || 'Invalid user';
      return next(new Error(`Authentication error: ${msg}`));
    }

    // Attach user info to socket
    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.sessionId = sessionId;
    socket.deviceId = deviceId;
    socket.userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';

    next();
  } catch (err) {
    console.error('[Auth] Internal error:', err.message);
    next(new Error('Authentication error: Internal server error'));
  }
};

module.exports = { authMiddleware };
