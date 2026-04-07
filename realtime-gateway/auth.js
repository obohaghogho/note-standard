const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const authMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    // 1. Initial validation
    if (!token || typeof token !== 'string' || token.trim() === '' || token === 'undefined' || token === 'null') {
      console.warn(`[Auth] ✗ Connection rejected: Token is type '${typeof token}' or value '${token}'`);
      return next(new Error('Authentication error: Token missing or malformed'));
    }

    // 2. Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      const isSessionMissing = error?.message?.includes('Auth session missing');
      console.error(`[Auth] ✗ JWT verification failed: ${error?.message || 'Invalid user'} (Token: ${token.substring(0, 10)}...)`);
      
      if (isSessionMissing) {
        return next(new Error('Authentication error: Session expired or missing'));
      }
      return next(new Error('Authentication error: Invalid token'));
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
