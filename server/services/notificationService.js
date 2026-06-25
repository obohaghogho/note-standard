const supabase = require("../config/database");
// Gateway is authoritative for all push notifications.

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

    // 3. Web Push (PWA — VAPID) is now handled entirely by the Realtime Gateway.
    //    All push routing goes through /internal/push below.

    // 4. Native Push (FCM for Android, APNs for iOS) via the realtime-gateway.
    //    The gateway holds Firebase Admin and APNs credentials.
    //    We route through the gateway's /internal/push for all native push notifications.

    const gatewayUrlStr = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5000';
    const bodyStr = message || title;
    
    // Temporary: Disable KeepAlive to test if Render is tearing down long-lived sockets
    // and causing the push request to fail silently.
    if (!global.__pushHttpAgent) {
      const http = require('http');
      const https = require('https');
      global.__pushHttpAgent = new http.Agent({ keepAlive: false });
      global.__pushHttpsAgent = new https.Agent({ keepAlive: false });
    }
    
    const targetUrl = new URL('/internal/push', gatewayUrlStr);
    const payloadBody = JSON.stringify({
      userId: receiverId,
      title,
      body: bodyStr,
      payload: {
        type,
        conversationId: conversationId || null,
        messageId: messageId || null,
        url: link || '/dashboard/notifications',
        recipientId: receiverId,        // legacy compat
        targetUserId: receiverId,       // explicit
        targetAccountId: receiverId,    // explicit (same as userId in this app)
        deliveryWebhookUrl: messageId ? `${gatewayUrlStr}/deliver/${messageId}` : undefined,
      },
    });

    const lib = targetUrl.protocol === 'https:' ? require('https') : require('http');
    const agent = targetUrl.protocol === 'https:' ? global.__pushHttpsAgent : global.__pushHttpAgent;

    const req = lib.request({
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payloadBody) },
      agent: agent,
      timeout: 10000 // 10 seconds timeout
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        console.log(`[NotificationService] Gateway push response status: ${res.statusCode}`);
        console.log(`[NotificationService] Gateway push response body: ${responseBody}`);
      });
    });

    req.on('error', (err) => {
      console.error('[NotificationService] ❌ Native push via gateway failed.');
      console.error(`[NotificationService] Target URL: ${gatewayUrlStr}/internal/push`);
      console.error(`[NotificationService] Error Code: ${err.code}`);
      console.error(`[NotificationService] Errno: ${err.errno}`);
      console.error(`[NotificationService] Hostname: ${err.hostname}`);
      console.error(`[NotificationService] Stack: ${err.stack}`);
    });
    
    req.on('timeout', () => {
      console.error('[NotificationService] ❌ Gateway push request timed out.');
      req.destroy();
    });

    console.log(`[NotificationService] 📤 Dispatching HTTP push request to Gateway: ${gatewayUrlStr}/internal/push`);
    console.log(`[NotificationService] Payload: ${payloadBody.substring(0, 150)}...`);
    
    req.write(payloadBody);
    req.end();

    return true;
  } catch (err) {
    console.error("Error creating notification:", err.message);
    return false;
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

    // 4. Send Push Notifications to everyone via Gateway
    const gatewayUrl = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5000';
    const lib = gatewayUrl.startsWith('https') ? require('https') : require('http');
    
    // Broadcast via Gateway handles BOTH native tokens and web push subscriptions natively
    const payloadBody = JSON.stringify({
      title,
      body: message,
      payload: {
        type,
        url: link || '/dashboard/notifications',
      },
    });

    const req = lib.request({
      hostname: new URL(gatewayUrl).hostname,
      port: new URL(gatewayUrl).port || (gatewayUrl.startsWith('https') ? 443 : 80),
      path: '/internal/push/broadcast',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payloadBody) }
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {});
    });

    req.on('error', (err) => console.error('[NotificationService] Broadcast push via gateway failed:', err.message));
    req.write(payloadBody);
    req.end();

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
