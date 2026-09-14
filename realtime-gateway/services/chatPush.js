/**
 * chatPush.js — v2 Data-Only Push for Chat Messages
 *
 * Single responsibility: send a push notification to wake the recipient's device.
 * The background handler on the device shows the notification and fires the
 * delivery webhook (→ receiptEngine.markDelivered).
 *
 * Rules:
 *   - Data-only FCM (no notification block) — JS thread always wakes
 *   - Single table: device_installations (no legacy native_device_tokens)
 *   - No routing decisions — caller already decided push is needed
 *   - No presence checks — caller already checked
 */

const admin = require('firebase-admin');
const webpush = require('web-push');

// In-memory cache for user installation/endpoints: Map<userId, { installations, expiresAt }>
const installationsCache = new Map();
const CACHE_TTL_MS = 15000; // 15 seconds TTL


/**
 * @param {object}  opts
 * @param {object}  opts.supabase       - Supabase client
 * @param {object}  opts.firebaseApp    - Firebase Admin app (may be null)
 * @param {string}  opts.userId         - recipient user ID
 * @param {string}  opts.title
 * @param {string}  opts.body
 * @param {string}  opts.messageId
 * @param {string}  opts.conversationId
 * @param {string}  opts.gatewayUrl     - e.g. https://realtime-gateway-gsb5.onrender.com
 */
const DeviceRegistry = require('./DeviceRegistry');
const PushDispatcher = require('./PushDispatcher');

/**
 * @param {object}  opts
 * @param {object}  opts.supabase       - Supabase client
 * @param {object}  opts.firebaseApp    - Firebase Admin app (may be null)
 * @param {string}  opts.userId         - recipient user ID
 * @param {string}  opts.title
 * @param {string}  opts.body
 * @param {string}  opts.messageId
 * @param {string}  opts.conversationId
 * @param {string}  opts.gatewayUrl     - e.g. https://realtime-gateway-gsb5.onrender.com
 * @param {string}  [opts.correlationId]
 */
async function sendChatPush({ supabase, firebaseApp: fbApp, userId, title, body, messageId, conversationId, url, link, gatewayUrl, correlationId }) {
  if (!supabase || !userId) return;

  // 1. Fetch normalized, deduplicated devices via DeviceRegistry (single source of truth)
  const devices = await DeviceRegistry.getActiveDevices(supabase, userId);

  if (!devices || devices.length === 0) {
    console.log(`[ChatPush] No active, healthy devices found for user ${userId} | cid:${correlationId || 'N/A'}`);
    return;
  }

  let targetUrl = url || link;
  if (!targetUrl && conversationId) {
    try {
      const [{ data: conv }, { data: profile }] = await Promise.all([
        supabase.from('conversations').select('chat_type, type, name').eq('id', conversationId).single(),
        supabase.from('profiles').select('role').eq('id', userId).single()
      ]);

      const isSupportConv = conv?.chat_type === 'support' || conv?.name === 'Support Chat' || (conv?.name && conv.name.toLowerCase().includes('support'));
      const isAdminOrSupport = profile?.role === 'admin' || profile?.role === 'support' || profile?.role === 'super_admin';

      if (isSupportConv) {
        targetUrl = isAdminOrSupport 
          ? `/admin/chats?id=${conversationId}` 
          : `/dashboard/chat?id=${conversationId}&openSupport=true`;
      } else {
        targetUrl = `/dashboard/chat?id=${conversationId}`;
      }
    } catch (e) {
      targetUrl = `/dashboard/chat?id=${conversationId}`;
    }
  }

  // 2. Dispatch platform-tailored push notifications via PushDispatcher
  const dispatchResult = await PushDispatcher.dispatch({
    supabase,
    firebaseApp: fbApp,
    devices,
    userId,
    title,
    body,
    messageId,
    conversationId,
    url: targetUrl,
    gatewayUrl,
    correlationId
  });

  if (messageId) {
    supabase.from('push_delivery_telemetry')
      .update({
        push_sent: dispatchResult.sent > 0,
        provider_result: dispatchResult.sent > 0 ? `success (${dispatchResult.sent} sent)` : `failed (${dispatchResult.failed} failed)`
      })
      .eq('message_id', messageId)
      .eq('recipient_id', userId)
      .then()
      .catch(err => {
        console.error('[ChatPush] Telemetry update warning:', err.message);
      });
  }

  console.log(`[ChatPush] Dispatched push for user ${userId}: ${dispatchResult.sent} sent, ${dispatchResult.failed} failed | messageId:${messageId || 'N/A'}`);
}

/** FCM dual-payload push (works when app process is closed/killed) */
async function sendFcm(fbApp, supabase, target, { userId, title, body, messageId, conversationId, webhookUrl }) {
  const message = {
    token: target.push_endpoint,
    notification: {
      title: String(title || 'New Message'),
      body: String(body || 'You have a new message'),
    },
    data: {
      type: 'chat_message',
      title: String(title || 'New Message'),
      body: String(body || 'You have a new message'),
      messageId: String(messageId || ''),
      conversationId: String(conversationId || ''),
      url: String(conversationId ? `/dashboard/chat?id=${conversationId}` : '/dashboard/chat'),
      deliveryWebhookUrl: String(webhookUrl || ''),
      recipientId: String(userId || ''),
      targetAccountId: String(userId || ''),
    },
    android: {
      priority: 'high',
      ttl: 86400,
      notification: {
        channelId: 'default',
        sound: 'default',
        priority: 'high',
        visibility: 'public',
        defaultSound: true,
        defaultVibrateTimings: true,
      },
    },
  };

  try {
    const fcmId = await admin.messaging().send(message);
    console.log(`[ChatPush] ✅ FCM | device:${target.device_id} | fcmId:${fcmId}`);
  } catch (err) {
    console.error(`[ChatPush] ❌ FCM | device:${target.device_id} | ${err.code || err.message}`);
    if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
      supabase.from('device_installations').delete().eq('push_endpoint', target.push_endpoint).then();
    }
  }
}

/** Web push (VAPID) */
async function sendWeb(supabase, target, { userId, title, body, messageId, conversationId, webhookUrl }) {
  if (!process.env.VAPID_PUBLIC_KEY) return;

  const payload = JSON.stringify({
    title: title || 'New Message',
    body: body || 'You have a new message',
    data: {
      type: 'chat_message',
      messageId,
      conversationId,
      url: conversationId ? `/dashboard/chat?id=${conversationId}` : '/dashboard/chat',
      recipientId: userId,
      targetAccountId: userId,
      deliveryWebhookUrl: webhookUrl || '',
    },
  });

  try {
    await webpush.sendNotification(
      { endpoint: target.push_endpoint, keys: { p256dh: target.push_p256dh, auth: target.push_auth } },
      payload
    );
    console.log(`[ChatPush] ✅ Web | device:${target.device_id}`);
  } catch (err) {
    console.error(`[ChatPush] ❌ Web | device:${target.device_id} | ${err.statusCode || err.message}`);
    if (err.statusCode === 410 || err.statusCode === 404) {
      supabase.from('device_installations').delete().eq('push_endpoint', target.push_endpoint).then();
    }
  }
}

/**
 * Clears the in-memory installation cache for a specific user.
 * Call this whenever the user's session_state changes (e.g. after register-session)
 * to ensure the next push uses a fresh DB query instead of stale cached data.
 * Also clears the DeviceRegistry cache to prevent stale device lists.
 */
function clearUserCache(userId) {
  if (userId) {
    installationsCache.delete(userId);
    // Also clear the DeviceRegistry's separate cache so the next push
    // fetches a fresh device list from DB (not stale V2 data).
    try {
      const DeviceRegistry = require('./DeviceRegistry');
      DeviceRegistry.clearUserCache(userId);
      console.log(`[ChatPush] 🗑 Cache cleared (chatPush + DeviceRegistry) for user ${userId}`);
    } catch (e) {
      console.warn('[ChatPush] DeviceRegistry cache clear failed (non-fatal):', e.message);
      console.log(`[ChatPush] 🗑 Cache cleared (chatPush only) for user ${userId}`);
    }
  }
}

module.exports = { sendChatPush, clearUserCache };
