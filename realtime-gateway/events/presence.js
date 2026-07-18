/**
 * Presence Event Handler — Realtime Gateway
 * 
 * Tracks users online status via Memory AND Supabase Database.
 */
const { createClient } = require('@supabase/supabase-js');

// Lazy supabase getter — avoids crash-on-load when env vars not yet available
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Map<userId, Set<socketId>>
const onlineUsers = new Map();
// Map<userId, boolean> tracking if the user wants their online status broadcasted
const userVisibility = new Map();
const lastSeenMap = new Map();
// Map<socketId, deviceId> — canonical device ID for each active socket
const socketDeviceMap = new Map();

function getOnlineUserIds() {
  return Array.from(onlineUsers.keys());
}

function isUserOnline(userId) {
  const sockets = onlineUsers.get(userId);
  return sockets && sockets.size > 0 && userVisibility.get(userId) !== false;
}

function getUserSockets(userId) {
  const sockets = onlineUsers.get(userId);
  return sockets ? Array.from(sockets) : [];
}

function markUserOnline(userId, socketId, deviceId) {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socketId);
  if (deviceId) {
    socketDeviceMap.set(socketId, deviceId);
    console.log(`[DeviceDiagnostic] Socket registered | userId:${userId} | socketId:${socketId} | deviceId:${deviceId}`);
  }
}

function removeSocket(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    socketDeviceMap.delete(socketId);
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

/**
 * Returns the set of canonical device IDs actively connected for a given user.
 * Used by computeV2Routing to do per-device suppression.
 */
function getActiveDeviceIds(userId) {
  const sockets = onlineUsers.get(userId);
  if (!sockets || sockets.size === 0) return new Set();
  const deviceIds = new Set();
  sockets.forEach(sid => {
    const dId = socketDeviceMap.get(sid);
    if (dId) deviceIds.add(dId);
  });
  return deviceIds;
}

module.exports = (io, socket) => {
  const userId = socket.userId;

  // 1. On connect: Fetch all online users + DB state
  const initPresence = async () => {
    try {
      // First tell the user who we currently think is online (from memory)
      const onlineIds = getOnlineUserIds().filter(id => userVisibility.get(id) !== false);
      socket.emit('presence:initial', onlineIds);

      const sb = getSupabase();
      if (!sb) {
        markUserOnline(userId, socket.id, socket.deviceId);
        return;
      }

      // Fetch this connected user's visibility setting
      const { data } = await sb
        .from('profiles')
        .select('show_online_status, last_seen')
        .eq('id', userId)
        .single();

      const isVisible = data?.show_online_status ?? true;
      userVisibility.set(userId, isVisible);

      const wasAlreadyOnline = onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
      markUserOnline(userId, socket.id, socket.deviceId);

      // If they are visible, update DB last_seen and is_online, and broadcast online
      if (isVisible) {
        // Sync is_online to true
        await sb.from('profiles').update({ 
          last_seen: new Date().toISOString(),
          is_online: true
        }).eq('id', userId);

        if (!wasAlreadyOnline) {
          console.log(`[Presence] ✓ ${userId} is now ONLINE (Visible: true)`);
          console.log(`[FORENSIC][GW] PRESENCE_ONLINE | socket_id:${socket.id} | user_id:${userId} | ts:${Date.now()}`);
          socket.broadcast.emit('user_online', {
            userId,
            online: true,
            lastSeen: null
          });
        }
      } else {
        console.log(`[Presence] ✓ ${userId} connected but is HIDDEN`);
        // Sync is_online to false since they want to be offline/hidden
        await sb.from('profiles').update({ is_online: false }).eq('id', userId);
      }
    } catch (err) {
      console.error('[Presence] DB Init Error:', err.message);
      markUserOnline(userId, socket.id, socket.deviceId);
      // Fallback update — guard against missing client
      const sb = getSupabase();
      if (sb) {
        sb.from('profiles').update({ is_online: true }).eq('id', userId).then(() => {}).catch(() => {});
      }
    }
  };

  initPresence();

  // 3. Heartbeat
  socket.on('presence:heartbeat', () => {
    const isVisible = userVisibility.get(userId) !== false;
    const wasOnline = onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
    markUserOnline(userId, socket.id, socket.deviceId);

    if (!wasOnline && isVisible) {
      console.log(`[Presence] ↑ ${userId} heartbeat — back ONLINE`);
      // Update is_online in database
      const sb = getSupabase();
      if (sb) {
        sb.from('profiles').update({ is_online: true }).eq('id', userId).then(() => {}).catch(() => {});
      }
      socket.broadcast.emit('user_online', { userId, online: true, lastSeen: null });
    }
  });

  // Client sent an event that their settings changed
  socket.on('presence:settings_changed', ({ show_online_status }) => {
    userVisibility.set(userId, show_online_status);
    console.log(`[Presence] ⚙️ ${userId} visibility changed to ${show_online_status}`);
    
    // Update DB
    const sb = getSupabase();
    if (sb) {
      sb.from('profiles')
        .update({ is_online: show_online_status })
        .eq('id', userId)
        .then(() => {}).catch(err => console.error('[Presence] DB Settings Update Error:', err.message));
    }

    // Broadcast immediately so clients update without waiting for disconnect
    io.emit('user_online', {
      userId,
      online: show_online_status,
      lastSeen: new Date().toISOString()
    });
  });

  const handleOffline = async (reason) => {
    const { wentOffline, lastSeen } = removeSocket(userId, socket.id);
    if (wentOffline) {
      console.log(`[Presence] ✗ ${userId} ${reason} — now OFFLINE`);
      
      // Update DB with the exact disconnect time and set is_online to false
      const sb = getSupabase();
      if (sb) {
        sb.from('profiles')
          .update({ 
            last_seen: lastSeen,
            is_online: false
          })
          .eq('id', userId)
          .then(() => console.log(`[Presence] DB updated last_seen and is_online for ${userId}`))
          .catch(err => console.error('[Presence] DB Update Error:', err.message));
      }

      // Broadcast offline
      io.emit('user_online', { userId, online: false, lastSeen });
    }
  };

  socket.on('presence:offline', () => handleOffline('explicitly went offline'));
  socket.on('disconnect', () => handleOffline('disconnected'));
};

module.exports.isUserOnline = isUserOnline;
module.exports.getOnlineUserIds = getOnlineUserIds;
module.exports.getUserSockets = getUserSockets;
module.exports.getActiveDeviceIds = getActiveDeviceIds;
