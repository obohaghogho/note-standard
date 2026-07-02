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
async function sendChatPush({ supabase, firebaseApp: fbApp, userId, title, body, messageId, conversationId, gatewayUrl }) {
  if (!supabase || !userId) return;

  // Ensure Web Push details are configured
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
      webpush.setVapidDetails(
        `mailto:${process.env.EMAIL_FROM || "noreply@notestandard.com"}`,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    } catch (e) {
      // VAPID keys might already be set up, ignore error
    }
  }

  // Resolve or initialize Firebase App instance
  let resolvedFbApp = fbApp || (admin.apps.length > 0 ? admin.apps[0] : null);
  if (!resolvedFbApp) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        resolvedFbApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('[ChatPush] Firebase Admin initialized inside ChatPush.');
      } catch (err) {
        console.error('[ChatPush] Firebase initialization failed:', err.message);
      }
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      try {
        const path = require('path');
        const accountPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        const serviceAccount = require(accountPath);
        resolvedFbApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('[ChatPush] Firebase Admin initialized via file path inside ChatPush.');
      } catch (err) {
        console.error('[ChatPush] Firebase initialization via file failed:', err.message);
      }
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      try {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        resolvedFbApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          })
        });
        console.log('[ChatPush] Firebase Admin initialized via individual env vars inside ChatPush.');
      } catch (err) {
        console.error('[ChatPush] Firebase initialization via individual env vars failed:', err.message);
      }
    }
  }

  // 1. Fetch endpoints from the single source of truth
  const { data: installations, error } = await supabase
    .from('installation_accounts')
    .select('session_state, device_installations(installation_id, type, push_endpoint, platform, push_p256dh, push_auth, device_id, endpoint_status)')
    .eq('user_id', userId);

  if (error) {
    console.error('[ChatPush] Failed to query installations:', error.message);
    return;
  }

  if (!installations || installations.length === 0) {
    console.log(`[ChatPush] No installations for user ${userId}`);
    return;
  }

  // 2. Collect valid push targets
  const targets = [];
  for (const inst of installations) {
    if (inst.session_state !== 'ACTIVE' && inst.session_state !== 'BACKGROUND') continue;
    const device = Array.isArray(inst.device_installations) ? inst.device_installations[0] : inst.device_installations;
    if (!device?.push_endpoint || device.endpoint_status === 'INVALID') continue;
    targets.push(device);
  }

  if (targets.length === 0) {
    console.log(`[ChatPush] No valid endpoints for user ${userId}`);
    return;
  }

  const webhookUrl = messageId && gatewayUrl ? `${gatewayUrl}/deliver/${messageId}?recipientId=${userId}` : '';

  // 3. Send to each target
  const results = await Promise.allSettled(targets.map(t => {
    if (t.platform === 'android' && t.type === 'fcm' && resolvedFbApp) {
      return sendFcm(resolvedFbApp, supabase, t, { userId, title, body, messageId, conversationId, webhookUrl });
    }
    if (t.platform === 'web' && t.type === 'vapid' && t.push_endpoint) {
      return sendWeb(supabase, t, { userId, title, body, messageId, conversationId });
    }
    return Promise.resolve(); // iOS APNs: add here when needed
  }));

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  let providerResult = 'none';
  if (sent > 0) {
    providerResult = `success (${sent} sent)`;
  } else if (failed > 0) {
    const firstError = results.find(r => r.status === 'rejected');
    providerResult = `failed: ${firstError?.reason?.message || 'unknown error'}`;
  }

  try {
    await supabase.from('push_delivery_telemetry')
      .update({
        push_sent: sent > 0,
        provider_result: providerResult
      })
      .eq('message_id', messageId)
      .eq('recipient_id', userId);
  } catch (err) {
    console.error('[ChatPush] Telemetry update failed:', err.message);
  }

  console.log(`[ChatPush] Sent ${sent}/${targets.length} pushes for user ${userId} | messageId:${messageId || 'N/A'}`);
}

/** FCM data-only push */
async function sendFcm(fbApp, supabase, target, { userId, title, body, messageId, conversationId, webhookUrl }) {
  const message = {
    token: target.push_endpoint,
    data: {
      type: 'chat_message',
      title: String(title || 'New Message'),
      body: String(body || 'You have a new message'),
      messageId: String(messageId || ''),
      conversationId: String(conversationId || ''),
      deliveryWebhookUrl: String(webhookUrl || ''),
    },
    android: { priority: 'high', ttl: 86400 },
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
async function sendWeb(supabase, target, { userId, title, body, messageId, conversationId }) {
  if (!process.env.VAPID_PUBLIC_KEY) return;

  const payload = JSON.stringify({
    title: title || 'New Message',
    body: body || 'You have a new message',
    data: { type: 'chat_message', messageId, conversationId, url: '/dashboard/chat' },
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

module.exports = { sendChatPush };
