const admin = require('firebase-admin');
const apn = require('apn');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const webpush = require('web-push');

// Initialize Supabase for fetching tokens
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Web Push (PWA)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_FROM || "noreply@notestandard.com"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('[PushService] Web Push (VAPID) initialized.');
} else {
  console.warn('[PushService] VAPID keys missing. Web Push notifications for PWA calls will be disabled.');
}

// Initialize Firebase Admin (Android FCM)
let firebaseApp = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[PushService] Firebase Admin initialized via FIREBASE_SERVICE_ACCOUNT env var string.');
  } catch (err) {
    console.error('[PushService] Firebase initialization via FIREBASE_SERVICE_ACCOUNT JSON failed:', err.message);
  }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  try {
    const accountPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const serviceAccount = require(accountPath);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[PushService] Firebase Admin initialized via file path.');
  } catch (err) {
    console.error('[PushService] Firebase initialization via file failed:', err.message);
  }
} else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      })
    });
    console.log('[PushService] Firebase Admin initialized via individual env vars.');
  } catch (err) {
    console.error('[PushService] Firebase initialization via individual env vars failed:', err.message);
  }
} else {
  try {
    firebaseApp = admin.initializeApp();
    console.log('[PushService] Firebase Admin initialized using Application Default Credentials.');
  } catch (err) {
    console.warn('[PushService] Firebase Admin default/ADC initialization skipped/failed:', err.message);
  }
}

// Initialize APNs (iOS VoIP & Chat)
let apnProviderProd = null;
let apnProviderSandbox = null;

let apnsKey = null;
if (process.env.APNS_KEY) {
  apnsKey = process.env.APNS_KEY.replace(/\\n/g, '\n');
} else if (process.env.APNS_KEY_PATH) {
  try {
    const fs = require('fs');
    const accountPath = path.resolve(process.cwd(), process.env.APNS_KEY_PATH);
    if (fs.existsSync(accountPath)) {
      apnsKey = fs.readFileSync(accountPath, 'utf8');
      console.log('[PushService] Loaded APNs key from APNS_KEY_PATH file.');
    } else {
      apnsKey = process.env.APNS_KEY_PATH;
    }
  } catch (err) {
    console.warn('[PushService] APNs key file read fallback failed, passing path directly:', err.message);
    apnsKey = process.env.APNS_KEY_PATH;
  }
}

if (apnsKey && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID) {
  try {
    const tokenConfig = {
      key: apnsKey,
      keyId: process.env.APNS_KEY_ID,
      teamId: process.env.APNS_TEAM_ID,
    };
    
    apnProviderProd = new apn.Provider({
      token: tokenConfig,
      production: true
    });
    
    apnProviderSandbox = new apn.Provider({
      token: tokenConfig,
      production: false
    });
    
    console.log('[PushService] APNs Providers (Prod & Sandbox) initialized.');
  } catch (err) {
    console.error('[PushService] APNs initialization failed:', err.message);
  }
} else {
  console.warn('[PushService] APNs initialization skipped: APNS_KEY or APNS_KEY_PATH/ID/TEAM_ID missing.');
}

/**
 * Helper to remove invalid tokens from database
 */
async function removeInvalidToken(token) {
  try {
    await supabase.from('native_device_tokens').delete().eq('token', token);
    console.log(`[PushService] 🗑 Removed invalid token from DB: ${token.substring(0, 10)}...`);
  } catch (e) {
    console.error(`[PushService] ❌ Failed to remove invalid token:`, e.message);
  }
}

/**
 * Helper to send APNs notification with automatic Sandbox fallback
 */
async function sendApnsWithFallback(notification, token, label) {
  if (!apnProviderProd || !apnProviderSandbox) return;
  
  try {
    const resultProd = await apnProviderProd.send(notification, token);
    
    if (resultProd.failed && resultProd.failed.length > 0) {
      const failure = resultProd.failed[0];
      const isBadToken = failure.response && failure.response.reason === 'BadDeviceToken';
      
      if (isBadToken) {
        console.log(`[PushService] 🔄 APNs Prod rejected token for ${label} (BadDeviceToken). Falling back to Sandbox...`);
        const resultSandbox = await apnProviderSandbox.send(notification, token);
        
        if (resultSandbox.failed && resultSandbox.failed.length > 0) {
          console.error(`[PushService] ❌ APNs Sandbox also failed for ${label}:`, JSON.stringify(resultSandbox.failed));
          const sandboxFailure = resultSandbox.failed[0];
          if (sandboxFailure.response && sandboxFailure.response.reason === 'BadDeviceToken') {
            await removeInvalidToken(token);
          }
        } else {
          console.log(`[PushService] ✅ APNs Sandbox delivery successful for ${label}.`);
        }
      } else {
        console.error(`[PushService] ❌ APNs Prod failed for ${label}:`, JSON.stringify(resultProd.failed));
        if (failure.response && (failure.response.reason === 'Unregistered' || failure.response.reason === 'BadDeviceToken')) {
          await removeInvalidToken(token);
        }
      }
    } else {
      console.log(`[PushService] ✅ APNs Prod delivery successful for ${label}.`);
    }
  } catch (err) {
    console.error(`[PushService] ❌ APNs delivery error for ${label}:`, err.message);
  }
}

/**
 * Sends high-priority push notifications to wake up native apps
 * @param {Object} params - { userId, title, body, payload }
 */
async function sendCallPush(params) {
  if (process.env.PUSH_ENABLED !== 'true') return;
  const { userId, title, body, payload } = params;
  
  try {
    // 1. Fetch native tokens for the user
    const { data: tokens, error } = await supabase
      .from('native_device_tokens')
      .select('token, platform, type')
      .eq('user_id', userId);

    // 1.5. Fetch web push subscriptions for PWA users
    const { data: webSubscriptions, error: webError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (error && webError) throw error || webError;

    if ((!tokens || tokens.length === 0) && (!webSubscriptions || webSubscriptions.length === 0)) {
      console.log(`[PushService] No native tokens or web subscriptions found for user ${userId}`);
      return;
    }

    console.log(`[PushService] 📡 [DUAL-DELIVERY] Signaling user ${userId}`);
    console.log(`[PushService] 📦 Payload:`, JSON.stringify(payload, null, 2));

    const pushPromises = [];

    // --- Native Push (FCM / APNs) ---
    if (tokens && tokens.length > 0) {
      const nativePromises = tokens.map(async (t) => {
      // Android FCM - Dual-payload high-priority for native wake-up and system tray display fallback
      if (t.platform === 'android' && t.type === 'fcm' && firebaseApp) {
        // Sanitize all values to strings to prevent FCM crashing
        const safeData = {};
        for (const key in payload) {
          if (payload[key] !== undefined && payload[key] !== null) {
            safeData[key] = String(payload[key]);
          }
        }

        const message = {
          token: t.token,
          // REMOVED notification block to ensure this acts as a "data-only" message.
          // Data-only messages bypass the Android system tray and instantly wake up the 
          // React Native headless JS engine (setBackgroundMessageHandler), which is required 
          // to trigger RNCallKeep's ringing UI when the app is killed.
          data: {
            ...safeData,
            // Native layer expects string values for remoteMessage.getData()
            type: String(payload.type || 'incoming_call'),
            caller_id: String(payload.callerId || ''),
            caller_name: String(payload.callerName || ''),
            call_type: String(payload.callType || ''),
            call_id: String(payload.sessionId || payload.callId || payload.peerId || ''),
            conversation_id: String(payload.conversationId || ''),
          },
          android: {
            priority: 'high',
            ttl: 0, // No delay, no queueing if expired
          }
        };
        console.log(`[PushService] 📤 Sending FCM Call push (Android) to: ${t.token.substring(0, 10)}...`);
        return admin.messaging().send(message)
          .catch(err => {
            console.error(`[PushService] ❌ FCM call push fail for ${t.token.substring(0, 10)}:`, err.message);
            if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
              removeInvalidToken(t.token);
            }
          });
      }

      // iOS VoIP - PushKit specific for immediate CallKit trigger
      if (t.platform === 'ios' && t.type === 'voip' && (apnProviderProd || apnProviderSandbox)) {
        const notification = new apn.Notification();
        notification.topic = (process.env.APNS_BUNDLE_ID || 'com.notestandard.app') + '.voip';
        notification.priority = 10;
        notification.pushType = 'voip';
        notification.expiry = 0; // Immediate delivery, do not store
        notification.alert = {
          title: `Incoming ${payload.callType} call`,
          body: `${payload.callerName} is calling you...`
        };
        notification.sound = 'default';
        notification.contentAvailable = true;
        notification.payload = {
          ...payload,
          uuid: payload.peerId || payload.callId,
          callerName: payload.callerName, // Duplicate for root access
        };
        
        console.log(`[PushService] 📤 Initiating VoIP Push (iOS) to topic: ${notification.topic}`);
        return sendApnsWithFallback(notification, t.token, 'VoIP');
      }
    });
    pushPromises.push(...nativePromises);
    } // End of Native Push

    // --- Web Push (PWA) ---
    if (webSubscriptions && webSubscriptions.length > 0 && process.env.VAPID_PUBLIC_KEY) {
      const webPushPayload = JSON.stringify({
        title: title,
        body: body,
        icon: "/icon-192.png",
        data: {
          url: payload.url || '/chat',
          type: 'call_incoming', // MUST match client/public/sw.js
          callerId: payload.callerId,
          callerName: payload.callerName,
          callType: payload.callType,
          conversationId: payload.conversationId,
          sessionId: payload.sessionId || payload.callId || payload.peerId,
          targetAccountId: userId,
          apiUrl: process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? 'https://note-standard-api.onrender.com' : 'http://127.0.0.1:5001')
        }
      });

      const webPushPromises = webSubscriptions.map(sub => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        };

        console.log(`[PushService] 📤 Sending Web Push (PWA) to: ${sub.endpoint.substring(0, 30)}...`);
        return webpush.sendNotification(pushSubscription, webPushPayload)
          .catch(err => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              console.log(`[PushService] 🗑 Removed invalid web push sub: ${sub.endpoint.substring(0, 30)}...`);
              return supabase.from("push_subscriptions")
                .delete()
                .match({ user_id: userId, endpoint: sub.endpoint });
            }
            console.error(`[PushService] ❌ Web Push call push fail for ${sub.endpoint.substring(0, 30)}...:`, err.message);
          });
      });
      pushPromises.push(...webPushPromises);
    }

    await Promise.all(pushPromises);
    console.log(`[PushService] ✅ Signaling sequence completed.`);
  } catch (err) {
    console.error('[PushService] Global error:', err.message);
  }
}

/**
 * Sends generic push notifications to native apps.
 * Uses FCM notification messages (Android) and APNs alert push (iOS).
 * NOTE: This is separate from sendCallPush which uses VoIP-only channels.
 *
 * @param {Object} params - { userId, title, body, payload }
 */
async function sendGenericPush(params) {
  if (process.env.PUSH_ENABLED !== 'true') return;
  const { userId, title, body, payload } = params;

  try {
    // --- 1. Native tokens (FCM / APNs) ---
    const { data: tokens, error } = await supabase
      .from('native_device_tokens')
      .select('token, platform, type')
      .eq('user_id', userId);

    const nativePromises = [];

    if (!error && tokens && tokens.length > 0) {
      tokens.forEach((t) => {
        // Android FCM — notification + data message shows in system tray when app is closed
        if (t.platform === 'android' && t.type === 'fcm' && firebaseApp) {
          const message = {
            token: t.token,
            notification: {
              title: title,
              body: body,
            },
            data: {
              type: String(payload.type || 'notification'),
              conversationId: String(payload.conversationId || ''),
              messageId: String(payload.messageId || ''),
              url: String(payload.url || '/dashboard/notifications'),
              recipientId: String(payload.recipientId || ''),
              targetUserId: String(payload.targetUserId || payload.recipientId || ''),
              targetAccountId: String(payload.targetAccountId || payload.recipientId || ''),
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
                tag: payload.conversationId ? `chat-${payload.conversationId}` : `type-${payload.type || 'notification'}`,
              },
            },
          };
          console.log(`[PushService] 📤 Sending FCM notification (Android) to: ${t.token.substring(0, 10)}...`);
          nativePromises.push(
            admin.messaging().send(message).catch(err => {
              console.error(`[PushService] ❌ FCM chat fail:`, err.message);
              if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
                removeInvalidToken(t.token);
              }
            })
          );
        }

        // iOS APNs — alert push (NOT voip) for regular chat notifications
        if (t.platform === 'ios' && t.type === 'apns') {
          if (!apnProviderProd && !apnProviderSandbox) {
            console.warn('[PushService] ⚠️ iOS APNs provider not initialised — skipping for user:', userId);
            return;
          }
          const notification = new apn.Notification();
          notification.topic = process.env.APNS_BUNDLE_ID || 'com.notestandard.app';
          notification.priority = 10;
          notification.pushType = 'alert';
          notification.alert = { title, body };
          notification.sound = 'default';
          notification.badge = 1;
          notification.contentAvailable = true;
          notification.mutableContent = true;
          notification.threadId = payload.conversationId || payload.type || 'default';
          notification.payload = {
            type: payload.type || 'notification',
            conversationId: payload.conversationId,
            messageId: payload.messageId,
            url: payload.url || '/dashboard/notifications',
            recipientId: payload.recipientId || null,
            targetUserId: payload.targetUserId || payload.recipientId || null,
            targetAccountId: payload.targetAccountId || payload.recipientId || null,
          };
          console.log(`[PushService] 📤 Initiating APNs alert (iOS) to topic: ${notification.topic}`);
          nativePromises.push(sendApnsWithFallback(notification, t.token, 'Chat'));
        }
      });
    } else {
      console.log(`[PushService] No native tokens found for user ${userId} (chat push)`);
    }

    // --- 2. Web Push (PWA / Browser — VAPID) ---
    // CRITICAL FIX: sendGenericPush previously skipped web push entirely, causing
    // browsers (PWA) to never receive chat message notifications.
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      const { data: webSubs, error: webErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);

      if (!webErr && webSubs && webSubs.length > 0) {
        const webPayload = JSON.stringify({
          title,
          body,
          icon: '/icon-192.png',
          data: {
            url: payload.url || '/dashboard/notifications',
            type: payload.type || 'chat_message',
            messageId: payload.messageId || null,
            conversationId: payload.conversationId || null,
            targetAccountId: userId,
            apiUrl: process.env.BACKEND_URL || 'https://note-standard-api.onrender.com',
          },
        });

        const webPromises = webSubs.map(sub =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            webPayload
          ).catch(err => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              // Subscription expired — clean it up
              supabase.from('push_subscriptions').delete()
                .match({ user_id: userId, endpoint: sub.endpoint })
                .then(() => console.log(`[PushService] 🗑 Removed expired web push sub for user ${userId}`));
            } else {
              console.error(`[PushService] ❌ Web push failed for user ${userId}:`, err.message);
            }
          })
        );

        nativePromises.push(...webPromises);
        console.log(`[PushService] 📤 Web push dispatched to ${webSubs.length} subscription(s) for user ${userId}`);
      } else {
        console.log(`[PushService] No web push subscriptions found for user ${userId}`);
      }
    }

    await Promise.all(nativePromises.filter(Boolean));
    console.log(`[PushService] ✅ Push completed for user ${userId}.`);
  } catch (err) {
    console.error('[PushService] sendGenericPush error:', err.message);
  }
}


/**
 * Sends a broadcast push notification to all native devices.
 * Uses pagination to avoid overwhelming memory or API limits.
 *
 * @param {Object} params - { title, body, payload }
 */
async function sendBroadcastPush(params) {
  if (process.env.PUSH_ENABLED !== 'true') return;
  const { title, body, payload } = params;
  try {
    const { data: tokens, error } = await supabase
      .from('native_device_tokens')
      .select('token, platform, type, user_id');

    if (error || !tokens || tokens.length === 0) {
      console.log(`[PushService] No native tokens found for broadcast`);
      return;
    }

    console.log(`[PushService] 📡 Broadcasting to ${tokens.length} native devices...`);
    
    // Process in chunks to respect FCM/APNs rate limits
    const chunkSize = 500;
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);
      const pushPromises = chunk.map(async (t) => {
        if (t.platform === 'android' && t.type === 'fcm' && firebaseApp) {
          const message = {
            token: t.token,
            notification: { title, body },
            data: {
              type: String(payload.type || 'notification'),
              url: String(payload.url || '/dashboard/notifications'),
            },
            android: {
              priority: 'high',
              notification: { sound: 'default', tag: `type-${payload.type || 'notification'}` },
            },
          };
          return admin.messaging().send(message).catch(err => {
            if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
              removeInvalidToken(t.token);
            }
          });
        }
        
        if (t.platform === 'ios' && t.type === 'apns' && (apnProviderProd || apnProviderSandbox)) {
          const notification = new apn.Notification();
          notification.topic = process.env.APNS_BUNDLE_ID || 'com.notestandard.app';
          notification.priority = 10;
          notification.pushType = 'alert';
          notification.alert = { title, body };
          notification.sound = 'default';
          notification.badge = 1;
          notification.contentAvailable = true;
          notification.mutableContent = true;
          notification.threadId = payload.type || 'default';
          notification.payload = {
            type: payload.type || 'notification',
            url: payload.url || '/dashboard/notifications',
          };
          return sendApnsWithFallback(notification, t.token, 'Broadcast');
        }
      });
      await Promise.all(pushPromises.filter(Boolean));
    }
    console.log(`[PushService] ✅ Broadcast completed.`);
  } catch (err) {
    console.error('[PushService] sendBroadcastPush error:', err.message);
  }
}

module.exports = {
  sendCallPush,
  sendGenericPush,
  sendBroadcastPush,
};
