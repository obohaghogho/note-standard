/**
 * Presence Event Handler — Realtime Gateway
 * 
 * Tracks which users are online via an in-memory Map.
 * Each user can have multiple sockets (multiple tabs/devices).
 * A user is "online" as long as they have at least one connected socket.
 * 
 * Events Handled:
 *   presence:heartbeat  — client pings every 30s to stay "online"
 *   presence:offline     — client explicitly goes offline (beforeunload)
 *   disconnect           — socket disconnects (cleanup)
 * 
 * Events Emitted:
 *   presence:initial     — list of all online user IDs (sent to newly connected socket)
 *   user_online          — { userId, online, lastSeen } broadcast on status change
 */

// ── Shared state ─────────────────────────────────────────────────
// Map<userId, Set<socketId>>
const onlineUsers = new Map();

// Map<userId, ISO timestamp> — last seen time for offline users
const lastSeenMap = new Map();

// ── Helpers ──────────────────────────────────────────────────────
function getOnlineUserIds() {
  return Array.from(onlineUsers.keys());
}

function isUserOnline(userId) {
  const sockets = onlineUsers.get(userId);
  return sockets && sockets.size > 0;
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
      const now = new Date().toISOString();
      lastSeenMap.set(userId, now);
      return { wentOffline: true, lastSeen: now };
    }
  }
  return { wentOffline: false };
}

// ── Event Handler ────────────────────────────────────────────────
module.exports = (io, socket) => {
  const userId = socket.userId;

  // 1. On connect: send the new socket the list of currently online users
  const onlineIds = getOnlineUserIds();
  socket.emit('presence:initial', onlineIds);

  // 2. Mark this user online immediately
  const wasAlreadyOnline = isUserOnline(userId);
  markUserOnline(userId, socket.id);

  // Broadcast to everyone that this user came online (only if they weren't already)
  if (!wasAlreadyOnline) {
    console.log(`[Presence] ✓ ${userId} is now ONLINE`);
    socket.broadcast.emit('user_online', {
      userId,
      online: true,
      lastSeen: null
    });
  }

  // 3. Heartbeat — keep the user online, re-broadcast if needed
  socket.on('presence:heartbeat', () => {
    const wasOnline = isUserOnline(userId);
    markUserOnline(userId, socket.id);

    // If they were somehow removed (e.g., stale cleanup), re-broadcast
    if (!wasOnline) {
      console.log(`[Presence] ↑ ${userId} heartbeat — back ONLINE`);
      socket.broadcast.emit('user_online', {
        userId,
        online: true,
        lastSeen: null
      });
    }
  });

  // 4. Explicit offline (beforeunload on client)
  socket.on('presence:offline', () => {
    const { wentOffline, lastSeen } = removeSocket(userId, socket.id);
    if (wentOffline) {
      console.log(`[Presence] ✗ ${userId} explicitly went OFFLINE`);
      io.emit('user_online', {
        userId,
        online: false,
        lastSeen
      });
    }
  });

  // 5. Socket disconnect — cleanup
  socket.on('disconnect', () => {
    const { wentOffline, lastSeen } = removeSocket(userId, socket.id);
    if (wentOffline) {
      console.log(`[Presence] ✗ ${userId} disconnected — now OFFLINE`);
      io.emit('user_online', {
        userId,
        online: false,
        lastSeen
      });
    }
  });
};

// Export helpers for use by other modules (e.g., call.js)
module.exports.isUserOnline = isUserOnline;
module.exports.getOnlineUserIds = getOnlineUserIds;
