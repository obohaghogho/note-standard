/**
 * Presence Event Handler — Realtime Gateway
 * 
 * Tracks users online status via Memory AND Supabase Database.
 */
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Map<userId, Set<socketId>>
const onlineUsers = new Map();
// Map<userId, boolean> tracking if the user wants their online status broadcasted
const userVisibility = new Map();
const lastSeenMap = new Map();

function getOnlineUserIds() {
  return Array.from(onlineUsers.keys());
}

function isUserOnline(userId) {
  const sockets = onlineUsers.get(userId);
  return sockets && sockets.size > 0 && userVisibility.get(userId) !== false;
}

function markUserOnline(userId, socketId) {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socketId);
}

function removeSocket(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
      userVisibility.delete(userId);
      const now = new Date().toISOString();
      lastSeenMap.set(userId, now);
      return { wentOffline: true, lastSeen: now };
    }
  }
  return { wentOffline: false };
}

module.exports = (io, socket) => {
  const userId = socket.userId;

  // 1. On connect: Fetch all online users + DB state
  const initPresence = async () => {
    try {
      // First tell the user who we currently think is online (from memory)
      const onlineIds = getOnlineUserIds().filter(id => userVisibility.get(id) !== false);
      socket.emit('presence:initial', onlineIds);

      // Fetch this connected user's visibility setting
      const { data } = await supabase
        .from('profiles')
        .select('show_online_status, last_seen')
        .eq('id', userId)
        .single();

      const isVisible = data?.show_online_status ?? true;
      userVisibility.set(userId, isVisible);

      const wasAlreadyOnline = onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
      markUserOnline(userId, socket.id);

      // If they are visible and just came online, broadcast
      if (isVisible && !wasAlreadyOnline) {
        console.log(`[Presence] ✓ ${userId} is now ONLINE (Visible: true)`);
        socket.broadcast.emit('user_online', {
          userId,
          online: true,
          lastSeen: null
        });
        
        // Update DB last_seen to now since they just logged in
        await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId);
      } else if (!isVisible) {
        console.log(`[Presence] ✓ ${userId} connected but is HIDDEN`);
      }
    } catch (err) {
      console.error('[Presence] DB Init Error:', err.message);
      markUserOnline(userId, socket.id);
    }
  };

  initPresence();

  // 3. Heartbeat
  socket.on('presence:heartbeat', () => {
    const isVisible = userVisibility.get(userId) !== false;
    const wasOnline = onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
    markUserOnline(userId, socket.id);

    if (!wasOnline && isVisible) {
      console.log(`[Presence] ↑ ${userId} heartbeat — back ONLINE`);
      socket.broadcast.emit('user_online', { userId, online: true, lastSeen: null });
    }
  });

  // Client sent an event that their settings changed
  socket.on('presence:settings_changed', ({ show_online_status }) => {
    userVisibility.set(userId, show_online_status);
    console.log(`[Presence] ⚙️ ${userId} visibility changed to ${show_online_status}`);
    
    // Broadcast immediately so clients update without waiting for disconnect
    io.emit('user_online', {
      userId,
      online: show_online_status,
      lastSeen: new Date().toISOString() // Show them as offline starting now
    });
  });

  const handleOffline = async (reason) => {
    const { wentOffline, lastSeen } = removeSocket(userId, socket.id);
    if (wentOffline) {
      console.log(`[Presence] ✗ ${userId} ${reason} — now OFFLINE`);
      
      // Update DB with the exact disconnect time
      supabase.from('profiles')
        .update({ last_seen: lastSeen })
        .eq('id', userId)
        .then(() => console.log(`[Presence] DB updated last_seen for ${userId}`))
        .catch(err => console.error('[Presence] DB Update Error:', err.message));

      // Broadcast offline
      io.emit('user_online', { userId, online: false, lastSeen });
    }
  };

  socket.on('presence:offline', () => handleOffline('explicitly went offline'));
  socket.on('disconnect', () => handleOffline('disconnected'));
};

module.exports.isUserOnline = isUserOnline;
module.exports.getOnlineUserIds = getOnlineUserIds;
