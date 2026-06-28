const admin = require('firebase-admin');
const apn = require('apn');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const webpush = require('web-push');
const presence = require('../events/presence');

// Initialize Supabase for fetching tokens with Keep-Alive to prevent TCP Port Exhaustion
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Initialize Web Push (PWA)
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  if (process.env.PUSH_ENABLED === 'true') {
    throw new Error("Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY while PUSH_ENABLED is true. Halting to prevent configuration drift.");
  } else {
    console.warn('[PushService] VAPID keys missing. Web Push notifications for PWA calls will be disabled.');
  }
} else {
  const fingerprint = require('crypto').createHash('sha256').update(process.env.VAPID_PUBLIC_KEY).digest('hex').substring(0, 16);
  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_FROM || "noreply@notestandard.com"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log(`[PushService] Web Push (VAPID) initialized. Fingerprint: ${fingerprint}`);
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

// ─── Startup validation summary ──────────────────────────────────────────────
// Runs once at module load so every deployment has an unambiguous log line.
(function logStartupState() {
  const pushEnabled = process.env.PUSH_ENABLED !== 'false';
  if (pushEnabled) {
    console.log('[PushService] ✅ Native push ENABLED (default or PUSH_ENABLED=true)');
  } else {
    console.warn('[PushService] ⚠️  Native push explicitly DISABLED (PUSH_ENABLED=false) — all FCM/APNs delivery will be skipped.');
  }

  if (firebaseApp) {
    console.log('[PushService] ✅ Firebase Admin (FCM) initialized — Android push ready.');
  } else {
    console.warn('[PushService] ⚠️  Firebase Admin NOT initialized — Android FCM push will be skipped.');
  }

  if (apnProviderProd) {
    console.log('[PushService] ✅ APNs provider (Prod + Sandbox) initialized — iOS push ready.');
  } else {
    console.warn('[PushService] ⚠️  APNs provider NOT initialized — iOS native push will be skipped (web push still works).');
  }

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    const fingerprint = require('crypto').createHash('sha256').update(process.env.VAPID_PUBLIC_KEY).digest('hex').substring(0, 16);
    console.log(`[PushService] ✅ Web Push (VAPID) configured — PWA push ready. Fingerprint: ${fingerprint}`);
  } else {
    console.warn('[PushService] ⚠️  VAPID keys missing — PWA web push will be skipped.');
  }
})();

/**
 * Helper to log push telemetry asynchronously
 */
function logPushMetric(metricData) {
  // Fire and forget to avoid blocking delivery
  supabase.from('push_metrics').insert([{
    platform: metricData.platform || 'unknown',
    push_type: metricData.push_type || 'unknown',
    status: metricData.status,
    error_code: metricData.error_code ? String(metricData.error_code).substring(0, 255) : null,
    user_id: metricData.user_id || null,
    device_id: metricData.device_id || null,
    vapid_version: metricData.vapid_version || null,
    endpoint_hash: metricData.endpoint_hash || null
  }]).then(({ error }) => {
    if (error) console.error('[PushMetrics] ❌ Failed to log metric:', error.message);
  }).catch(() => {});
}

/**
 * Helper to remove invalid tokens from database
 */
async function removeInvalidToken(token, platform = 'unknown', type = 'unknown', userId = null, deviceId = null) {
  try {
    await supabase.from('native_device_tokens').delete().eq('token', token);
    console.log(`[PushService] 🗑 Removed invalid token from DB: ${token.substring(0, 10)}...`);
    logPushMetric({ platform, push_type: type, status: 'invalid_removed', user_id: userId, device_id: deviceId });
  } catch (e) {
    console.error(`[PushService] ❌ Failed to remove invalid token:`, e.message);
  }
}

/**
 * Helper to send APNs notification with automatic Sandbox fallback
 */
async function sendApnsWithFallback(notification, token, label, platform = 'ios', type = 'unknown', userId = null, deviceId = null) {
  if (!apnProviderProd || !apnProviderSandbox) return;
  
  try {
    const resultProd = await apnProviderProd.send(notification, token);
    
    if (resultProd.failed && resultProd.failed.length > 0) {
      const failure = resultProd.failed[0];
      const isBadToken = failure.response && failure.response.reason === 'BadDeviceToken';
      
      if (isBadToken) {
        console.log(`[PushService] 🔄 APNs Prod rejected token for ${label} (BadDeviceToken). Falling back to Sandbox...`);
        logPushMetric({ platform, push_type: type, status: 'failed', error_code: 'BadDeviceToken (Prod)', user_id: userId, device_id: deviceId });
        const resultSandbox = await apnProviderSandbox.send(notification, token);
        
        if (resultSandbox.failed && resultSandbox.failed.length > 0) {
          console.error(`[PushService] ❌ APNs Sandbox also failed for ${label}:`, JSON.stringify(resultSandbox.failed));
          logPushMetric({ platform, push_type: type, status: 'failed', error_code: 'BadDeviceToken (Sandbox)', user_id: userId, device_id: deviceId });
          const sandboxFailure = resultSandbox.failed[0];
          if (sandboxFailure.response && sandboxFailure.response.reason === 'BadDeviceToken') {
            await removeInvalidToken(token, platform, type, userId, deviceId);
          }
        } else {
          console.log(`[PushService] ✅ APNs Sandbox delivery successful for ${label}.`);
          logPushMetric({ platform, push_type: type, status: 'accepted', user_id: userId, device_id: deviceId });
        }
      } else {
        const errorReason = failure.response && failure.response.reason ? failure.response.reason : 'Unknown Error';
        console.error(`[PushService] ❌ APNs Prod failed for ${label}:`, JSON.stringify(resultProd.failed));
        logPushMetric({ platform, push_type: type, status: 'failed', error_code: errorReason, user_id: userId, device_id: deviceId });
        if (failure.response && (failure.response.reason === 'Unregistered' || failure.response.reason === 'BadDeviceToken')) {
          await removeInvalidToken(token, platform, type, userId, deviceId);
        }
      }
    } else {
      console.log(`[PushService] ✅ APNs Prod delivery successful for ${label}.`);
      logPushMetric({ platform, push_type: type, status: 'accepted', user_id: userId, device_id: deviceId });
    }
  } catch (err) {
    console.error(`[PushService] ❌ APNs delivery error for ${label}:`, err.message);
    logPushMetric({ platform, push_type: type, status: 'failed', error_code: err.message, user_id: userId, device_id: deviceId });
  }
}

/**
 * Phase 2: Compute routing decisions using the new multi-account installation model.
 * Returns the routing decision object to the caller.
 */
async function computeV2Routing(params) {
  try {
    const { userId, payload } = params;
    const messageId = payload?.messageId || payload?.sessionId || 'unknown-' + Date.now();
    
    // 1. Resolve installations and session states
    const { data: installations, error } = await supabase
      .from('installation_accounts')
      .select('session_state, device_installations(installation_id, type, push_endpoint, platform, push_p256dh, push_auth, capabilities, device_id, endpoint_status)')
      .eq('user_id', userId);

    if (error) {
      console.error('[V2Router] Error fetching installations:', error);
      return { decision: 'ERROR', suppressionReason: error.message, error: true };
    }

    const sockets = presence.getUserSockets(userId);
    const activeDeviceIds = presence.getActiveDeviceIds(userId);
    const isOnline = sockets.length > 0;
    
    let decision = 'NO_INSTALLATION';
    let suppressionReason = null;
    let pushSent = false;
    let activeCount = 0;
    let loggedOutCount = 0;
    let endpointCount = 0;
    
    const resolvedInstallations = [];
    const pushTargets = [];

    if (installations && installations.length > 0) {
      decision = 'PUSH';
      
      installations.forEach(inst => {
        const state = inst.session_state;
        const deviceInst = Array.isArray(inst.device_installations) ? inst.device_installations[0] : inst.device_installations;
        
        resolvedInstallations.push({
          id: deviceInst ? deviceInst.installation_id : null,
          state: state
        });
        
        if (state === 'ACTIVE' || state === 'BACKGROUND') {
          activeCount++;
          if (deviceInst && deviceInst.push_endpoint && deviceInst.endpoint_status !== 'INVALID') {
            // ── Device-aware suppression ──────────────────────────────────────────
            // FIX: Previously this block suppressed push for ALL devices if ANY socket
            // was online for the user. Now we check if THIS specific device's canonical
            // device_id is present in the active socket map. A device is only suppressed
            // if its own socket is connected — not someone else's device.
            const isThisDeviceActive = deviceInst.device_id && activeDeviceIds.has(deviceInst.device_id);
            console.log(`[DeviceDiagnostic] Routing check | deviceId:${deviceInst.device_id} | activeDeviceIds:[${[...activeDeviceIds].join(',')}] | isActive:${isThisDeviceActive} | endpoint_status:${deviceInst.endpoint_status}`);
            endpointCount++;
            if (!isThisDeviceActive) {
              // Device not currently on a socket — include it as a push target
              pushTargets.push(deviceInst);
            } else {
              console.log(`[PushSuppression] Suppressing push to device ${deviceInst.device_id} (userId:${userId}) — active socket present.`);
            }
          }
        } else if (state === 'LOGGED_OUT') {
          loggedOutCount++;
        }
      });
      
      if (loggedOutCount === installations.length) {
        decision = 'NO_ACTIVE_SESSION';
        suppressionReason = 'USER_LOGGED_OUT_ON_ALL_DEVICES';
        pushSent = false;
      } else if (endpointCount === 0) {
        decision = 'NO_ENDPOINT';
        suppressionReason = 'NO_VALID_ENDPOINTS';
        pushSent = false;
      } else if (pushTargets.length === 0) {
        // All valid endpoints belong to active devices — suppress entirely
        decision = 'SUPPRESSED';
        suppressionReason = 'ACTIVE_SOCKET_PRESENT_ON_ALL_DEVICES';
        pushSent = false;
      } else {
        decision = 'PUSH';
        pushSent = true;
      }
    }

    return {
      decision,
      suppressionReason,
      pushSent,
      resolvedInstallations,
      pushTargets,
      installationCount: installations ? installations.length : 0,
      activeSocketCount: sockets.length,
      endpointCount,
      messageId
    };
  } catch (err) {
    console.error('[V2Router] Error:', err.message);
    return { decision: 'ERROR', suppressionReason: err.message, error: true };
  }
}

/**
 * Log V2 Telemetry Helper
 */
async function logV2Telemetry(params, routingData, fallbackUsed, provider = null, providerResult = null, latencyMs = null) {
  try {
    const { userId } = params;
    await supabase.from('push_delivery_telemetry').insert({
      message_id: routingData.messageId,
      recipient_id: userId,
      resolved_installations: routingData.resolvedInstallations || [],
      socket_present: routingData.activeSocketCount > 0,
      push_sent: routingData.pushSent || false,
      reason: routingData.suppressionReason || routingData.decision,
      routing_engine_version: 'v2-live',
      routing_decision: routingData.decision,
      suppression_reason: routingData.suppressionReason || null,
      installation_count: routingData.installationCount || 0,
      active_socket_count: routingData.activeSocketCount || 0,
      endpoint_count: routingData.endpointCount || 0,
      fallback_used: fallbackUsed
    });
  } catch (err) {
    console.error('[V2Router] Telemetry Error:', err.message);
  }
}

/**
 * Sends high-priority push notifications to wake up native apps
 * @param {Object} params - { userId, title, body, payload }
 */
async function sendCallPush(params) {
  if (process.env.PUSH_ENABLED === 'false') return;
  const { userId, title, body, payload } = params;
  
  // Phase 2: Live Cutover Logic
  const useV2 = process.env.USE_V2_PUSH_ROUTING === 'true';
  const allowFallback = process.env.ALLOW_V2_FALLBACK !== 'false';

  if (useV2) {
    const routingData = await computeV2Routing(params);
    let fallbackUsed = false;
    
    if (routingData.decision === 'PUSH') {
      await dispatchV2Push(params, routingData.pushTargets, true);
      await logV2Telemetry(params, routingData, fallbackUsed);
      return;
    } else if (routingData.decision === 'SUPPRESSED') {
      console.log(`[V2Router] Call push suppressed for ${userId}: ${routingData.suppressionReason}`);
      await logV2Telemetry(params, routingData, fallbackUsed);
      return;
    } else if (routingData.decision === 'NO_ACTIVE_SESSION') {
      console.log(`[V2Router] Call push aborted for ${userId}: ${routingData.suppressionReason}`);
      await logV2Telemetry(params, routingData, fallbackUsed);
      return;
    } else if (routingData.decision === 'NO_INSTALLATION' || routingData.decision === 'NO_ENDPOINT') {
      if (allowFallback) {
        console.warn(`[V2Router] No V2 installations for ${userId}. FALLING BACK TO LEGACY.`);
        fallbackUsed = true;
        await logV2Telemetry(params, routingData, fallbackUsed);
      } else {
        console.warn(`[V2Router] No V2 installations for ${userId} and fallback disabled. Aborting.`);
        await logV2Telemetry(params, routingData, fallbackUsed);
        return;
      }
    }
  } else {
    // Phase 1.5 Shadow Mode
    const shadowData = await computeV2Routing(params);
    await logV2Telemetry(params, shadowData, false);
  }
  
  try {
    // 1. Fetch native tokens for the user
    const { data: tokens, error } = await supabase
      .from('native_device_tokens')
      .select('token, platform, type, device_id')
      .eq('user_id', userId);

    // 1.5. Fetch web push subscriptions for PWA users
    const { data: webSubscriptions, error: webError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, vapid_key_version')
      .eq('user_id', userId);

    if (error && webError) throw error || webError;

    if ((!tokens || tokens.length === 0) && (!webSubscriptions || webSubscriptions.length === 0)) {
      console.log(`[FORENSIC][PushService] ⚠️ CALL PUSH SKIPPED for user ${userId}: No valid native or web push subscriptions found.`);
      return;
    }

    const isOnline = presence.isUserOnline(userId);
    const sockets = presence.getUserSockets(userId);
    console.log(`[FORENSIC][PushService] 📡 [DUAL-DELIVERY] Signaling user ${userId}. Online: ${isOnline}, Sockets: ${sockets.length} ([${sockets.join(',')}])`);
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
        logPushMetric({ platform: t.platform, push_type: t.type, status: 'attempted', user_id: userId, device_id: t.device_id });
        return admin.messaging().send(message)
          .then(() => {
            logPushMetric({ platform: t.platform, push_type: t.type, status: 'accepted', user_id: userId, device_id: t.device_id });
          })
          .catch(err => {
            console.error(`[PushService] ❌ FCM call push fail for ${t.token.substring(0, 10)}:`, err.message);
            logPushMetric({ platform: t.platform, push_type: t.type, status: 'failed', error_code: err.code || err.message, user_id: userId, device_id: t.device_id });
            if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
              removeInvalidToken(t.token, t.platform, t.type, userId, t.device_id);
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
        // PHASE 7 FIX: Use sessionId as the canonical CallKit UUID.
        // CallKit requires a stable UUID; peerId is a user ID (not a UUID format).
        // sessionId is generated as a UUID by the signaling layer and is safe here.
        notification.payload = {
          ...payload,
          uuid: payload.sessionId || payload.callId,
          callerName: payload.callerName, // Duplicate for root access
        };
        
        console.log(`[PushService] 📤 Initiating VoIP Push (iOS) to topic: ${notification.topic}`);
        logPushMetric({ platform: t.platform, push_type: t.type, status: 'attempted', user_id: userId, device_id: t.device_id });
        return sendApnsWithFallback(notification, t.token, 'VoIP', t.platform, t.type, userId, t.device_id);
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

        const endpointHash = require('crypto').createHash('sha256').update(sub.endpoint).digest('hex').substring(0, 16);

        if (sub.vapid_key_version && sub.vapid_key_version !== process.env.VAPID_PUBLIC_KEY) {
          console.log(`[PushService] ⚠️ VAPID mismatch for web push sub: ${sub.endpoint.substring(0, 30)}... removing stale sub.`);
          logPushMetric({ platform: 'web', push_type: 'vapid', status: 'invalid_removed', error_code: 'vapid_mismatch', user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
          return supabase.from("push_subscriptions").delete().match({ user_id: userId, endpoint: sub.endpoint });
        }

        console.log(`[PushService] 📤 Sending Web Push (PWA) to: ${sub.endpoint.substring(0, 30)}...`);
        logPushMetric({ platform: 'web', push_type: 'vapid', status: 'attempted', user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
        return webpush.sendNotification(pushSubscription, webPushPayload)
          .then(() => {
            logPushMetric({ platform: 'web', push_type: 'vapid', status: 'accepted', user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
          })
          .catch(err => {
            logPushMetric({ platform: 'web', push_type: 'vapid', status: 'failed', error_code: String(err.statusCode || err.message), user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
            if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 400 || err.statusCode === 403) {
              console.log(`[FORENSIC][PushService] ⚠️ Marking web push sub INVALID: ${sub.endpoint.substring(0, 30)}... (Status: ${err.statusCode})`);
              logPushMetric({ platform: 'web', push_type: 'vapid', status: 'invalid_marked', error_code: String(err.statusCode), user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
              
              // We don't delete legacy subscriptions instantly here anymore, but legacy doesn't have endpoint_status. 
              // We will just delete legacy as it's legacy.
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
 * Executes push notification delivery using the V2 device_installations schema.
 */
async function dispatchV2Push(params, pushTargets, isCall = false) {
  const { userId, title, body, payload } = params;
  const nativePromises = [];

  for (const t of pushTargets) {
    if (t.platform === 'android' && t.type === 'fcm' && firebaseApp) {
      const message = {
        token: t.push_endpoint,
        notification: isCall ? undefined : { title, body },
        data: isCall ? {
          ...Object.fromEntries(Object.entries(payload || {}).map(([k, v]) => [k, String(v)])),
          type: String(payload?.type || 'incoming_call'),
          caller_id: String(payload?.callerId || ''),
          caller_name: String(payload?.callerName || ''),
          call_type: String(payload?.callType || ''),
          call_id: String(payload?.sessionId || payload?.callId || payload?.peerId || ''),
          conversation_id: String(payload?.conversationId || ''),
        } : {
          type: String(payload?.type || 'notification'),
          conversationId: String(payload?.conversationId || ''),
          messageId: String(payload?.messageId || ''),
          url: String(payload?.url || '/dashboard/notifications'),
          recipientId: String(payload?.recipientId || ''),
          targetUserId: String(payload?.targetUserId || payload?.recipientId || ''),
          targetAccountId: String(payload?.targetAccountId || payload?.recipientId || ''),
        },
        android: {
          priority: 'high',
          ttl: isCall ? 0 : undefined,
          notification: isCall ? undefined : {
            sound: 'default',
            tag: payload?.conversationId ? `chat-${payload.conversationId}` : `type-${payload?.type || 'notification'}`,
          },
        },
      };

      console.log(`[V2Router] 📤 Sending FCM to V2 Installation (${t.device_id}): ${t.push_endpoint.substring(0, 10)}...`);
      logPushMetric({ platform: t.platform, push_type: t.type, status: 'attempted', user_id: userId, device_id: t.device_id });
      
      nativePromises.push(
        admin.messaging().send(message)
          .then(() => logPushMetric({ platform: t.platform, push_type: t.type, status: 'accepted', user_id: userId, device_id: t.device_id }))
          .catch(err => {
            console.error(`[V2Router] ❌ FCM fail:`, err.message);
            logPushMetric({ platform: t.platform, push_type: t.type, status: 'failed', error_code: err.code || err.message, user_id: userId, device_id: t.device_id });
            if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
              supabase.from('device_installations').delete().eq('push_endpoint', t.push_endpoint).then();
            }
          })
      );
    } else if (t.platform === 'ios' && t.type === 'apns' && apnProviderProd) {
       // APNs logic omitted for brevity in V2 unless needed. Standard fallback to legacy for iOS can handle it.
       console.log("[V2Router] iOS APNs not fully ported to V2 dispatcher yet, relying on legacy for iOS if needed.");
    } else if (t.platform === 'web' && t.type === 'vapid' && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      if (isCall) continue; // Web pushes usually don't handle VoIP call pushes the same way

      const webPayload = JSON.stringify({
        title,
        body,
        icon: '/icon-192.png',
        data: {
          url: payload?.url || '/dashboard/notifications',
          type: payload?.type || 'chat_message',
          messageId: payload?.messageId || null,
          conversationId: payload?.conversationId || null,
          targetAccountId: userId,
          apiUrl: process.env.BACKEND_URL || 'https://note-standard-api.onrender.com',
          deliveryWebhookUrl: payload?.messageId
            ? `${process.env.SELF_URL || 'https://realtime-gateway-gsb5.onrender.com'}/deliver/${payload.messageId}`
            : null,
        },
      });

      const endpointHash = require('crypto').createHash('sha256').update(t.push_endpoint).digest('hex').substring(0, 16);
      console.log(`[V2Router] 📤 Sending Web Push to V2 Installation (${t.device_id}): ${t.push_endpoint.substring(0, 30)}...`);
      logPushMetric({ platform: 'web', push_type: 'vapid', status: 'attempted', user_id: userId, device_id: t.device_id, endpoint_hash: endpointHash });
      
      nativePromises.push(
        webpush.sendNotification({ endpoint: t.push_endpoint, keys: { p256dh: t.push_p256dh, auth: t.push_auth } }, webPayload)
          .then(() => logPushMetric({ platform: 'web', push_type: 'vapid', status: 'accepted', user_id: userId, device_id: t.device_id, endpoint_hash: endpointHash }))
          .catch(err => {
            logPushMetric({ platform: 'web', push_type: 'vapid', status: 'failed', error_code: String(err.statusCode || err.message), user_id: userId, device_id: t.device_id, endpoint_hash: endpointHash });
            if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 400 || err.statusCode === 403) {
               console.log(`[FORENSIC][V2Router] ⚠️ Marking V2 Installation INVALID (${t.device_id}): ${t.push_endpoint.substring(0, 30)}... (Status: ${err.statusCode})`);
               supabase.from('device_installations')
                 .update({ 
                   endpoint_status: 'INVALID',
                   failure_reason: String(err.statusCode),
                   last_validation_reason: 'PROVIDER_REJECTED',
                   last_push_failure: new Date().toISOString()
                 })
                 .eq('push_endpoint', t.push_endpoint).then();
            }
          })
      );
    }
  }

  await Promise.all(nativePromises.filter(Boolean));
}

/**
 * Sends generic push notifications to native apps.
 * Uses FCM notification messages (Android) and APNs alert push (iOS).
 * NOTE: This is separate from sendCallPush which uses VoIP-only channels.
 *
 * @param {Object} params - { userId, title, body, payload }
 */
async function sendGenericPush(params) {
  if (process.env.PUSH_ENABLED === 'false') return;
  const { userId, title, body, payload } = params;

  // Phase 2: Live Cutover Logic
  const useV2 = process.env.USE_V2_PUSH_ROUTING === 'true';
  const allowFallback = process.env.ALLOW_V2_FALLBACK !== 'false'; // Defaults to true if V2 is active

  if (useV2) {
    const routingData = await computeV2Routing(params);
    let fallbackUsed = false;
    
    if (routingData.decision === 'PUSH') {
      await dispatchV2Push(params, routingData.pushTargets, false);
      await logV2Telemetry(params, routingData, fallbackUsed);
      return;
    } else if (routingData.decision === 'SUPPRESSED') {
      console.log(`[V2Router] Push suppressed for user ${userId}: ${routingData.suppressionReason}`);
      await logV2Telemetry(params, routingData, fallbackUsed);
      return;
    } else if (routingData.decision === 'NO_ACTIVE_SESSION') {
      console.log(`[V2Router] Push aborted for ${userId}: ${routingData.suppressionReason}`);
      await logV2Telemetry(params, routingData, fallbackUsed);
      return;
    } else if (routingData.decision === 'NO_INSTALLATION' || routingData.decision === 'NO_ENDPOINT') {
      if (allowFallback) {
        console.warn(`[V2Router] No V2 installations for ${userId}. FALLING BACK TO LEGACY.`);
        fallbackUsed = true;
        await logV2Telemetry(params, routingData, fallbackUsed);
        // Continue to legacy logic below
      } else {
        console.warn(`[V2Router] No V2 installations for ${userId} and fallback is disabled. Aborting.`);
        await logV2Telemetry(params, routingData, fallbackUsed);
        return;
      }
    }
  } else {
    // Phase 1.5 Shadow Mode (Legacy Active)
    const shadowData = await computeV2Routing(params);
    await logV2Telemetry(params, shadowData, false);
  }

  try {
    const isOnline = presence.isUserOnline(userId);
    const sockets = presence.getUserSockets(userId);
    console.log(`[FORENSIC][PushService] Preparing push for user ${userId}. Online: ${isOnline}, Sockets: ${sockets.length} ([${sockets.join(',')}])`);

    // --- 1. Native tokens (FCM / APNs) ---
    const { data: tokens, error } = await supabase
      .from('native_device_tokens')
      .select('token, platform, type, device_id')
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
          logPushMetric({ platform: t.platform, push_type: t.type, status: 'attempted', user_id: userId, device_id: t.device_id });
          nativePromises.push(
            admin.messaging().send(message)
              .then(() => {
                logPushMetric({ platform: t.platform, push_type: t.type, status: 'accepted', user_id: userId, device_id: t.device_id });
              })
              .catch(err => {
              console.error(`[PushService] ❌ FCM chat fail:`, err.message);
              logPushMetric({ platform: t.platform, push_type: t.type, status: 'failed', error_code: err.code || err.message, user_id: userId, device_id: t.device_id });
              if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
                removeInvalidToken(t.token, t.platform, t.type, userId, t.device_id);
              }
            })
          );
        }

        // iOS APNs — alert push (NOT voip) for regular chat notifications
        if (t.platform === 'ios' && t.type === 'apns') {
          if (!apnProviderProd && !apnProviderSandbox) {
            console.warn(`[PushService] ⚠️ iOS APNs provider not initialised — skipping native push for user ${userId}. Web push (VAPID) is unaffected.`);
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
          console.log(`[PushService] 📤 Initiating APNs Alert Push (iOS) to topic: ${notification.topic}`);
          logPushMetric({ platform: t.platform, push_type: t.type, status: 'attempted', user_id: userId, device_id: t.device_id });
          nativePromises.push(sendApnsWithFallback(notification, t.token, 'Alert', t.platform, t.type, userId, t.device_id));
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
        .select('endpoint, p256dh, auth, vapid_key_version')
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
            // FAST-PATH FIX: Point directly to the gateway for delivery receipts.
            // The gateway is always awake (it holds the sender's socket).
            // The API server may be asleep on Render free tier (30-90s cold start).
            deliveryWebhookUrl: payload.messageId
              ? `${process.env.SELF_URL || 'https://realtime-gateway-gsb5.onrender.com'}/deliver/${payload.messageId}`
              : null,
          },
        });

        const webPromises = webSubs.map(sub => {
          const endpointHash = require('crypto').createHash('sha256').update(sub.endpoint).digest('hex').substring(0, 16);

          if (sub.vapid_key_version && sub.vapid_key_version !== process.env.VAPID_PUBLIC_KEY) {
            console.log(`[PushService] ⚠️ VAPID mismatch for web push sub: ${sub.endpoint.substring(0, 30)}... marking as invalid.`);
            logPushMetric({ platform: 'web', push_type: 'vapid', status: 'invalid_removed', error_code: 'vapid_mismatch', user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
            return supabase.from("push_subscriptions").update({ status: 'invalid', last_failed_push_at: new Date().toISOString() }).match({ user_id: userId, endpoint: sub.endpoint });
          }

          logPushMetric({ platform: 'web', push_type: 'vapid', status: 'attempted', user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
          return webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            webPayload
          ).then(() => {
            logPushMetric({ platform: 'web', push_type: 'vapid', status: 'accepted', user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
            return supabase.from('push_subscriptions').update({ last_successful_push_at: new Date().toISOString() }).match({ user_id: userId, endpoint: sub.endpoint });
          }).catch(err => {
            logPushMetric({ platform: 'web', push_type: 'vapid', status: 'failed', error_code: String(err.statusCode || err.message), user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
            if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 400 || err.statusCode === 403) {
              // Subscription expired or VAPID key mismatch (400, 403) — mark it invalid
              logPushMetric({ platform: 'web', push_type: 'vapid', status: 'invalid_removed', error_code: String(err.statusCode), user_id: userId, device_id: null, vapid_version: sub.vapid_key_version, endpoint_hash: endpointHash });
              return supabase.from('push_subscriptions').update({ status: 'invalid', last_failed_push_at: new Date().toISOString() })
                .match({ user_id: userId, endpoint: sub.endpoint })
                .then(() => console.log(`[PushService] ❌ Marked web push sub as invalid for user ${userId} (Status: ${err.statusCode})`));
            } else {
              console.error(`[PushService] ❌ Web push failed for user ${userId}:`, err.message);
              return supabase.from('push_subscriptions').update({ last_failed_push_at: new Date().toISOString() }).match({ user_id: userId, endpoint: sub.endpoint });
            }
          })
        });

        nativePromises.push(...webPromises);
        console.log(`[PushService] 📤 Web push dispatched to ${webSubs.length} subscription(s) for user ${userId}`);
      } else {
        console.log(`[PushService] No web push subscriptions found for user ${userId}`);
      }
    }

    await Promise.all(nativePromises.filter(Boolean));
    
    if (nativePromises.length === 0) {
      console.log(`[FORENSIC][PushService] ⚠️ PUSH SKIPPED for user ${userId}: No valid native or web push subscriptions found.`);
    } else {
      console.log(`[FORENSIC][PushService] ✅ Push dispatched to ${nativePromises.length} endpoint(s) for user ${userId}.`);
    }
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
  if (process.env.PUSH_ENABLED === 'false') return;
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
