const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Helper to fetch user with retry logic for Supabase Auth
 * Mitigates transient network/service availability issues
 */
const getUserWithRetry = async (token, maxAttempts = 3) => {
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
    const token = socket.handshake.auth.token;
    
    // 1. Initial validation
    if (!token || typeof token !== 'string' || token.trim() === '' || token === 'undefined' || token === 'null' || token.length < 10) {
      console.warn(`[Auth] ✗ Connection rejected: Malformed token '${token}'`);
      return next(new Error('Authentication error: Token missing or malformed'));
    }

    // 2. Verify token with Supabase (with retry logic)
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

    // Fetch profile info for UI (calls, etc.)
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', user.id)
      .single();

    socket.userName = profile?.full_name || profile?.username || user.email.split('@')[0];
    socket.userAvatar = profile?.avatar_url || null;
    
    console.log(`[Auth] User authenticated: ${user.id} (${socket.userName})`);
    next();
  } catch (err) {
    console.error('[Auth] Internal error:', err.message);
    next(new Error('Authentication error: Internal server error'));
  }
};

module.exports = { authMiddleware };
