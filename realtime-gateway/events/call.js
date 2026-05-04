const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const pushService = require('../services/pushService');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_FROM || "admin@example.com"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Global state to track active calls for late-joiner sync
// Key: targetUserId, Value: { from, fromName, fromAvatar, type, conversationId, peerId, startTime }
const activeCalls = new Map();

module.exports = (io, socket) => {
  const userId = socket.userId;

  // 0. Sync on connect: If someone is calling this user, notify them immediately
  const pendingCall = activeCalls.get(userId);
  if (pendingCall) {
    console.log(`[Call] 🔄 Syncing pending call for late-joiner: ${userId} (from: ${pendingCall.from})`);
    socket.emit('call:incoming', {
      from: pendingCall.from,
      fromName: pendingCall.fromName,
      fromAvatar: pendingCall.fromAvatar,
      type: pendingCall.type,
      conversationId: pendingCall.conversationId,
      peerId: pendingCall.peerId,
      isSync: true // Flag to indicate this is a late-join sync
    });
  }

  // 1. Initiate Call
  socket.on('call:initiate', async (data) => {
    const { to, type, conversationId, peerId } = data;
    console.log(`[Call] 📞 ${socket.userId} → ${to} (${type})`);
    
    // Store in active calls map
    activeCalls.set(to, {
      from: socket.userId,
      fromName: socket.userName,
      fromAvatar: socket.userAvatar,
      type,
      conversationId,
      peerId,
      startTime: Date.now()
    });

    io.to(`user:${to}`).emit('call:incoming', {
      from: socket.userId,
      fromName: socket.userName,
      fromAvatar: socket.userAvatar,
      type,
      conversationId,
      peerId
    });

    // ── NATIVE HIGH-PRIORITY PUSH (WAKE UP) ──
    try {
      console.log(`[Call] 📡 Dispatching native wake-up push for user: ${to}`);
      await pushService.sendCallPush({
        userId: to,
        title: `Incoming ${type} call`,
        body: `${socket.userName || 'Someone'} is calling you.`,
        payload: {
          type: 'incoming_call',
          callerId: socket.userId,
          callerName: socket.userName,
          callType: type,
          conversationId,
          peerId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (pushErr) {
      console.error('[Call] Native push dispatch failed:', pushErr.message);
    }

    // ── WEB PUSH FALLBACK FOR OFFLINE BROWSERS ──
    try {
      const sockets = await io.in(`user:${to}`).fetchSockets();
      if (sockets.length === 0 && supabase) {
        console.log(`[Call] ✗ User ${to} is perfectly offline. Routing Web Push Wakeup...`);
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('user_id', to);

        if (subs && subs.length > 0) {
          const pushPayload = JSON.stringify({
            title: `Incoming ${type} call`,
            body: `${socket.userName || 'Someone'} is calling you. Tap to answer!`,
            icon: socket.userAvatar || '/icon-192.png',
            data: {
              url: `/dashboard/chat?id=${conversationId}`, // Fixed param to match our new sync
              type: 'call_incoming'
            }
          });

          subs.forEach(async (sub) => {
            const pushSubscription = {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            };
            try {
              await webpush.sendNotification(pushSubscription, pushPayload);
            } catch (err) {
              if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription has expired
                await supabase.from('push_subscriptions').delete().match({ user_id: to, endpoint: sub.endpoint });
              }
            }
          });
        }
      }
    } catch (err) {
      console.error('[Call] Offline push mapping error:', err);
    }
  });

  // 2. Peer Ready (Signaling established)
  socket.on('call:ready', (data) => {
    const { to, peerId } = data;
    io.to(`user:${to}`).emit('call:ready', {
      from: socket.userId,
      peerId
    });
  });

  // Native WebRTC Transport (SDP/ICE)
  socket.on('call:signal', (data) => {
    const { to, signal } = data;
    io.to(`user:${to}`).emit('call:signal', {
      from: socket.userId,
      signal
    });
  });

  // 3. Reject Call
  socket.on('call:reject', async (data) => {
    const { to } = data;
    console.log(`[Call] ✗ ${socket.userId} rejected call from ${to}`);
    
    // Clear from active calls (if this user was the target)
    if (activeCalls.get(socket.userId)?.from === to) {
        activeCalls.delete(socket.userId);
    }

    io.to(`user:${to}`).emit('call:rejected', { from: socket.userId });

    // Send push to cancel UI on other devices
    try {
      await pushService.sendCallPush({
        userId: to,
        title: 'Call Ended',
        body: 'The call was rejected.',
        payload: {
          type: 'call_cancelled',
          callerId: socket.userId
        }
      });
    } catch (e) {
      console.error('[Call] Failed to send reject push:', e.message);
    }
  });

  // 4. End Call
  socket.on('call:end', async (data) => {
    const { to, conversationId } = data;
    console.log(`[Call] 🏁 ${socket.userId} ended call with ${to}`);
    
    // Clear from active calls (try both directions)
    if (activeCalls.get(to)?.from === socket.userId) {
        activeCalls.delete(to);
    }
    if (activeCalls.get(socket.userId)?.from === to) {
        activeCalls.delete(socket.userId);
    }

    io.to(`user:${to}`).emit('call:ended', {
      from: socket.userId,
      conversationId
    });

    // Send push to cancel UI on other devices
    try {
      await pushService.sendCallPush({
        userId: to,
        title: 'Call Ended',
        body: 'The call has ended.',
        payload: {
          type: 'call_cancelled',
          callerId: socket.userId
        }
      });
    } catch (e) {
      console.error('[Call] Failed to send cancel push:', e.message);
    }
  });

  // 5. Call Timeout Handler
  socket.on('call:timeout', async (data) => {
    const { to } = data;
    console.log(`[Call] 🕒 Timeout for call to ${to}`);
    
    // Clear from active calls
    if (activeCalls.get(to)?.from === socket.userId) {
        activeCalls.delete(to);
    }

    io.to(`user:${to}`).emit('call:timeout', { from: socket.userId });

    // Send missed call push
    try {
      await pushService.sendCallPush({
        userId: to,
        title: 'Missed Call',
        body: `You missed a call from ${socket.userName || 'Unknown'}`,
        payload: {
          type: 'call_cancelled',
          reason: 'timeout',
          callerId: socket.userId
        }
      });
    } catch (e) {
      console.error('[Call] Failed to send timeout push:', e.message);
    }
  });

  // 6. Disconnect Cleanup
  socket.on('disconnect', () => {
    // If this user was calling someone, clear it
    activeCalls.forEach((call, targetId) => {
        if (call.from === socket.userId) {
            console.log(`[Call] 🧹 Cleaning up active call from disconnected user: ${socket.userId}`);
            activeCalls.delete(targetId);
            io.to(`user:${targetId}`).emit('call:ended', { from: socket.userId });
        }
    });
    // If this user was being called, just leave it? 
    // Actually, if the target disconnects, the caller should probably be notified or just wait for timeout.
  });
};
