const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

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

module.exports = (io, socket) => {
  // ─── WebRTC Signaling ───────────────────────────────────────────
  
  // 1. Initiate Call
  socket.on('call:initiate', async (data) => {
    const { to, type, conversationId, peerId } = data;
    console.log(`[Call] 📞 ${socket.userId} → ${to} (${type})`);
    
    io.to(`user:${to}`).emit('call:incoming', {
      from: socket.userId,
      fromName: socket.userName,
      fromAvatar: socket.userAvatar,
      type,
      conversationId,
      peerId
    });

    // ── NATIVE PUSH FALLBACK FOR OFFLINE USERS ──
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
              url: `/dashboard/chat?conversation=${conversationId}`,
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
  socket.on('call:reject', (data) => {
    const { to } = data;
    console.log(`[Call] ✗ ${socket.userId} rejected call from ${to}`);
    io.to(`user:${to}`).emit('call:rejected', { from: socket.userId });
  });

  // 4. End Call
  socket.on('call:end', (data) => {
    const { to, conversationId } = data;
    console.log(`[Call] 🏁 ${socket.userId} ended call with ${to}`);
    io.to(`user:${to}`).emit('call:ended', {
      from: socket.userId,
      conversationId
    });
  });

  // 5. Call Timeout
  socket.on('call:timeout', (data) => {
    const { to } = data;
    io.to(`user:${to}`).emit('call:timeout', { from: socket.userId });
  });
};
