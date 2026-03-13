const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const authMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('[Auth] JWT verification failed:', error?.message);
      return next(new Error('Authentication error: Invalid token'));
    }

    // Attach user info to socket
    socket.userId = user.id;
    socket.userEmail = user.email;
    
    console.log(`[Auth] User authenticated: ${user.id}`);
    next();
  } catch (err) {
    console.error('[Auth] Internal error:', err.message);
    next(new Error('Authentication error: Internal server error'));
  }
};

module.exports = { authMiddleware };
