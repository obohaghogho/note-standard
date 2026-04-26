const admin = require('firebase-admin');
const apn = require('apn');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Initialize Supabase for fetching tokens
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Firebase Admin (Android FCM)
let firebaseApp = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  try {
    const accountPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const serviceAccount = require(accountPath);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[PushService] Firebase Admin initialized.');
  } catch (err) {
    console.error('[PushService] Firebase initialization failed:', err.message);
  }
}

// Initialize APNs (iOS VoIP)
let apnProvider = null;
if (process.env.APNS_KEY_PATH) {
  try {
    apnProvider = new apn.Provider({
      token: {
        key: process.env.APNS_KEY_PATH,
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
      },
      production: process.env.NODE_ENV === 'production'
    });
    console.log('[PushService] APNs Provider initialized.');
  } catch (err) {
    console.error('[PushService] APNs initialization failed:', err.message);
  }
}

/**
 * Sends high-priority push notifications to wake up native apps
 * @param {Object} params - { userId, title, body, payload }
 */
async function sendCallPush(params) {
  const { userId, title, body, payload } = params;
  
  try {
    // 1. Fetch native tokens for the user
    const { data: tokens, error } = await supabase
      .from('native_device_tokens')
      .select('token, platform, type')
      .eq('user_id', userId);

    if (error) throw error;
    if (!tokens || tokens.length === 0) {
      console.log(`[PushService] No native tokens found for user ${userId}`);
      return;
    }

    console.log(`[PushService] 📡 [DUAL-DELIVERY] Signaling user ${userId}`);
    console.log(`[PushService] 📦 Native Payload:`, JSON.stringify(payload, null, 2));

    const pushPromises = tokens.map(async (t) => {
      // Android FCM - Data-Only high-priority for native wake-up
      if (t.platform === 'android' && t.type === 'fcm' && firebaseApp) {
        const message = {
          token: t.token,
          data: {
            ...payload,
            // Native layer expects string values for remoteMessage.getData()
            type: String(payload.type),
            caller_id: String(payload.callerId),
            caller_name: String(payload.callerName),
            call_type: String(payload.callType),
            call_id: String(payload.callId || payload.peerId),
            conversation_id: String(payload.conversationId),
          },
          android: {
            priority: 'high',
            ttl: 0, // No delay, no queueing if expired
          }
        };
        console.log(`[PushService] 📤 Sending FCM Data-Only (Android) to: ${t.token.substring(0, 10)}...`);
        return admin.messaging().send(message)
          .catch(err => console.error(`[PushService] ❌ FCM fail for ${t.token.substring(0, 10)}:`, err.message));
      }

      // iOS VoIP - PushKit specific for immediate CallKit trigger
      if (t.platform === 'ios' && t.type === 'voip' && apnProvider) {
        const notification = new apn.Notification();
        notification.topic = (process.env.APNS_BUNDLE_ID || 'com.notestandard.app') + '.voip';
        notification.priority = 10;
        notification.pushType = 'voip';
        notification.payload = {
          ...payload,
          aps: {
            'content-available': 1 // Wake up app/PushKit delegate
          }
        };
        
        console.log(`[PushService] 📤 Sending VoIP Push (iOS) to topic: ${notification.topic}`);
        return apnProvider.send(notification, t.token)
          .catch(err => console.error(`[PushService] ❌ VoIP fail for ${t.token}:`, err.message));
      }
    });

    await Promise.all(pushPromises);
    console.log(`[PushService] ✅ Signaling sequence completed.`);
  } catch (err) {
    console.error('[PushService] Global error:', err.message);
  }
}

module.exports = {
  sendCallPush
};
