const supabase = require("../config/database");
const webpush = require("web-push");
// Configure web-push (keys must be present in .env or .env.development)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_FROM || "noreply@notestandard.com"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
} else {
  // Loaded successfully from server/.env when present
  console.warn("[NotificationService] VAPID keys missing. Push notifications will be disabled.");
}

const realtime = require("./realtimeService");

/**
 * Creates a notification and emits it via Gateway
 * @param {Object} params - Notification parameters
 * @param {string} params.receiverId - ID of the user receiving the notification
 * @param {string} [params.senderId] - ID of the user triggering the notification
 * @param {string} params.type - Type of notification (e.g., 'community_post', 'note_share', 'chat_message', 'mention', 'note_edit')
 * @param {string} params.title - Notification title
 * @param {string} [params.message] - Notification message
 * @param {string} [params.link] - Link to redirect the user
 */
const createNotification = async ({
  receiverId,
  senderId,
  type,
  title,
  message,
  link,
  messageId,
  conversationId,
}) => {
  try {
    // 1. Persist to Database
    const { data, error } = await supabase
      .from("notifications")
      .insert([{
        receiver_id: receiverId,
        sender_id: senderId,
        type,
        title,
        message,
        link,
        is_read: false,
      }])
      .select()
      .single();

    if (error) throw error;

    // 2. Real-time Delivery via Gateway
    await realtime.emitToUser(receiverId, "notification", {
      id: data.id,
      type,
      title,
      message,
      link,
      sender_id: senderId,
      created_at: data.created_at,
      is_read: false,
    });

    // 3. Web Push (PWA — VAPID) — deferred through PushQueue if system is booting
    const pushQueue = require('./pushQueue');
    const pushTask = () => sendPushNotification(receiverId, { title, message, link, type, messageId, conversationId });
    if (!global.BOOT_STATE?.ready) {
      pushQueue.push(pushTask);
    } else {
      await pushTask();
    }

    // 4. Native Push (FCM for Android, APNs for iOS) via the realtime-gateway.
    //    The gateway already holds Firebase Admin and APNs credentials (used for call push).
    //    We route through the gateway's /internal/push endpoint for all notifications.
    //    This ensures iOS users receive push notifications even when the PWA is closed.
    const gatewayUrl = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5000';
    const body = message || title;
    fetch(`${gatewayUrl}/internal/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: receiverId,
        title,
        body,
        payload: {
          type,
          conversationId: conversationId || null,
          messageId: messageId || null,
          url: link || '/dashboard/notifications',
          recipientId: receiverId,        // legacy compat
          targetUserId: receiverId,       // explicit
          targetAccountId: receiverId,    // explicit (same as userId in this app)
        },
      }),
    }).catch(err => console.error('[NotificationService] Native push via gateway failed:', err.message));

    return true;
  } catch (err) {
    console.error("Error creating notification:", err.message);
    return false;
  }
};

/**
 * Sends a push notification to all subscribed devices of a user
 */
const sendPushNotification = async (userId, payload) => {
  if (process.env.PUSH_ENABLED !== 'true') return;
  try {
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (error || !subscriptions) return;

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.message,
      icon: "/icon-192.png", // Default icon
      data: {
        url: payload.link,
        type: payload.type,
        messageId: payload.messageId,
        conversationId: payload.conversationId || null,
        targetAccountId: userId,
        apiUrl: process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? 'https://note-standard-api.onrender.com' : 'http://127.0.0.1:5001')
      },
    });

    const sendPromises = subscriptions.map((sub) => {
      // Reconstruct the subscription object required by web-push
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      return webpush.sendNotification(pushSubscription, pushPayload)
        .catch((err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription has expired or is no longer valid, delete it
            return supabase.from("push_subscriptions")
              .delete()
              .match({ user_id: userId, endpoint: sub.endpoint });
          }
          console.error("Push error:", err);
        });
    });

    await Promise.all(sendPromises);
  } catch (err) {
    console.error("Failed to send push notification:", err);
  }
};

/**
 * Broadcasts a notification to all users
 */
const broadcastNotification = async ({
  senderId,
  type,
  title,
  message,
  link,
}) => {
  try {
    // 1. Get all user IDs
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id");

    if (profileError) throw profileError;

    // 2. Persist to Database for everyone in safe chunks
    const chunkSize = 500;
    for (let i = 0; i < profiles.length; i += chunkSize) {
      const chunk = profiles.slice(i, i + chunkSize);
      const notificationsPayload = chunk.map((p) => ({
        receiver_id: p.id,
        sender_id: senderId,
        type,
        title,
        message,
        link,
        is_read: false,
      }));

      const { error } = await supabase
        .from("notifications")
        .insert(notificationsPayload);

      if (error) {
        console.error("Batch insert error:", error);
      }
    }

    // 3. Real-time Delivery via Gateway Broadcast
    await realtime.broadcast("notification", {
      type,
      title,
      message,
      link,
      sender_id: senderId,
      created_at: new Date().toISOString(),
      is_read: false,
    });

    // 4. Send Push Notifications to everyone in safe chunks
    if (process.env.PUSH_ENABLED === 'true') {
      const pushPayload = JSON.stringify({
        title,
        body: message,
        icon: "/logo192.png",
        data: { url: link, type },
      });

      // Fetch ALL subscriptions
      const { data: allSubscriptions } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth, user_id");

      if (allSubscriptions && allSubscriptions.length > 0) {
        for (let i = 0; i < allSubscriptions.length; i += chunkSize) {
          const subChunk = allSubscriptions.slice(i, i + chunkSize);
          await Promise.all(
            subChunk.map((sub) => {
              const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              };
              return webpush.sendNotification(pushSubscription, pushPayload).catch((err) => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                  return supabase.from("push_subscriptions")
                    .delete()
                    .match({ user_id: sub.user_id, endpoint: sub.endpoint });
                }
              });
            })
          );
        }
      }
    }

    // 5. Native Push Broadcast (FCM/APNs) via Gateway
    const gatewayUrl = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5000';
    fetch(`${gatewayUrl}/internal/push/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body: message,
        payload: {
          type,
          url: link || '/dashboard/notifications',
        },
      }),
    }).catch(err => console.error('[NotificationService] Native broadcast via gateway failed:', err.message));

    return true;
  } catch (err) {
    console.error("Error broadcasting notification:", err.message);
    return false;
  }
};

module.exports = {
  createNotification,
  broadcastNotification,
};
