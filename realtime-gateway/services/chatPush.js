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

  // 1. Fetch endpoints from cache or database (single source of truth)
  let installations = null;
  const nowTime = Date.now();
  const cached = installationsCache.get(userId);
  // isCacheMiss: true when the cache is empty/expired for this user.
  // On a cache miss we ALWAYS do a live DB read (no cache write for first-time calls
  // that race with session registration). This prevents the "first message silent skip"
  // where an empty cache entry was written before session_state turned ACTIVE.
  const isCacheMiss = !cached || cached.expiresAt <= nowTime;

  if (!isCacheMiss) {
    installations = cached.installations;
  } else {
    const { data, error } = await supabase
      .from('installation_accounts')
      .select('session_state, device_installations(installation_id, type, push_endpoint, platform, push_p256dh, push_auth, device_id, endpoint_status)')
      .eq('user_id', userId);

    if (error) {
      console.error('[ChatPush] Failed to query installations:', error.message);
      return;
    }

    installations = data || [];
    // Only cache if we found ACTIVE/BACKGROUND sessions — avoids caching an empty
    // result that was caused by session_state still being null/pending.
    const hasActiveSession = installations.some(i => i.session_state === 'ACTIVE' || i.session_state === 'BACKGROUND');
    if (hasActiveSession) {
      installationsCache.set(userId, {
        installations,
        expiresAt: nowTime + CACHE_TTL_MS
      });
    }
  }

  if (!installations || installations.length === 0) {
    console.log(`[ChatPush] No installations for user ${userId}`);
    return;
  }

  // 2. Collect valid push targets
  let targets = [];
  for (const inst of installations) {
    if (inst.session_state !== 'ACTIVE' && inst.session_state !== 'BACKGROUND') continue;
    const device = Array.isArray(inst.device_installations) ? inst.device_installations[0] : inst.device_installations;
    if (!device?.push_endpoint || device.endpoint_status === 'INVALID') continue;
    targets.push(device);
  }

  // FIX: Relaxed session_state fallback.
  // If no ACTIVE/BACKGROUND targets found, this likely means the session_state race
  // condition hit (socket connected before /api/auth/register-session completed).
  // Retry with relaxed filter: accept installations where session_state is null or any value.
  // This handles the window between first socket connect and session activation.
  if (targets.length === 0) {
    console.log(`[ChatPush] ⚠️ No ACTIVE/BACKGROUND targets for ${userId} — retrying with relaxed session_state filter (race condition recovery)`);
    for (const inst of installations) {
      if (inst.session_state === 'LOGGED_OUT') continue; // Only skip explicitly logged-out sessions
      const device = Array.isArray(inst.device_installations) ? inst.device_installations[0] : inst.device_installations;
      if (!device?.push_endpoint || device.endpoint_status === 'INVALID') continue;
      targets.push(device);
    }
  }

  // FIX: Legacy push_subscriptions fallback for PWA users.
  // Users who registered before the V2 installation_accounts system may only have
  // rows in the legacy push_subscriptions table. Fall back to those to avoid silent skips.
  if (targets.length === 0 && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    console.log(`[ChatPush] ⚠️ No V2 endpoints for ${userId} — falling back to legacy push_subscriptions`);
    try {
      const { data: legacySubs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);

      if (legacySubs && legacySubs.length > 0) {
        console.log(`[ChatPush] Found ${legacySubs.length} legacy push subscription(s) for user ${userId}`);
        const webhookUrlLegacy = messageId && gatewayUrl ? `${gatewayUrl}/deliver/${messageId}?recipientId=${userId}` : '';
        const legacyResults = await Promise.allSettled(legacySubs.map(sub => {
          const legacyPayload = JSON.stringify({
            title: title || 'New Message',
            body: body || 'You have a new message',
            icon: '/icon-192.png',
            data: {
              type: 'chat_message',
              messageId,
              conversationId,
              url: conversationId ? `/dashboard/chat?id=${conversationId}` : '/dashboard/chat',
              recipientId: userId,
              targetAccountId: userId,
              deliveryWebhookUrl: webhookUrlLegacy,
            },
          });
          return webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            legacyPayload
          ).then(() => {
            console.log(`[ChatPush] ✅ Legacy Web Push sent | user:${userId}`);
          }).catch(err => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              supabase.from('push_subscriptions').delete().match({ user_id: userId, endpoint: sub.endpoint }).then();
            }
            console.error(`[ChatPush] ❌ Legacy Web Push | user:${userId} | ${err.statusCode || err.message}`);
          });
        }));
        const legacySent = legacyResults.filter(r => r.status === 'fulfilled').length;
        console.log(`[ChatPush] Legacy fallback: sent ${legacySent}/${legacySubs.length} pushes for user ${userId}`);
        return; // Done — legacy fallback handled delivery
      }
    } catch (legacyErr) {
      console.error('[ChatPush] Legacy push_subscriptions fallback error:', legacyErr.message);
    }
  }

  if (targets.length === 0) {
    console.log(`[ChatPush] No valid endpoints for user ${userId} (V2 and legacy exhausted)`);
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

  if (messageId) {
    supabase.from('push_delivery_telemetry')
      .update({
        push_sent: sent > 0,
        provider_result: providerResult
      })
      .eq('message_id', messageId)
      .eq('recipient_id', userId)
      .then()
      .catch(err => {
        console.error('[ChatPush] Background telemetry update failed:', err.message);
      });
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
      recipientId: String(userId || ''),
      targetAccountId: String(userId || ''),
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
    data: {
      type: 'chat_message',
      messageId,
      conversationId,
      url: '/dashboard/chat',
      recipientId: userId,
      targetAccountId: userId,
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
 */
function clearUserCache(userId) {
  if (userId) {
    installationsCache.delete(userId);
    console.log(`[ChatPush] 🗑 Cache cleared for user ${userId}`);
  }
}

module.exports = { sendChatPush, clearUserCache };
