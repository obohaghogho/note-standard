/**
 * PushDispatcher.js — Platform-Aware Push Dispatcher (v3.0)
 *
 * Responsibilities:
 *   1. Consumes normalized device targets from DeviceRegistry.
 *   2. Formats platform-tailored push payloads:
 *      - Android: High-priority DATA-ONLY FCM payload (wakes JS thread for background delivery ACK).
 *      - Desktop Web / PWA: WebPush payload containing deliveryWebhookUrl for Service Worker.
 *      - iOS: APNs-compliant notification payload.
 *   3. Dispatches push notifications in parallel.
 *   4. Invalidates expired / revoked endpoints (HTTP 404 / 410 or FCM invalid token) in DB.
 */

const admin = require('firebase-admin');
const webpush = require('web-push');

function normalizeBase64Url(str) {
  if (!str) return str;
  return String(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

class PushDispatcher {
  /**
   * Dispatches push notifications across all active target devices for a recipient.
   *
   * @param {object} opts
   * @param {object} opts.supabase
   * @param {object} opts.firebaseApp
   * @param {Array<Object>} opts.devices - Target devices from DeviceRegistry
   * @param {string} opts.userId
   * @param {string} opts.title
   * @param {string} opts.body
   * @param {string} opts.messageId
   * @param {string} opts.conversationId
   * @param {string} opts.gatewayUrl
   * @param {string} [opts.correlationId]
   */
  static async dispatch({ supabase, firebaseApp, devices, userId, title, body, messageId, conversationId, url, link, gatewayUrl, correlationId }) {
    if (!supabase || !userId || !Array.isArray(devices) || devices.length === 0) {
      return { attempted: 0, sent: 0, failed: 0 };
    }

    // Configure Web Push credentials if set
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      try {
        webpush.setVapidDetails(
          `mailto:${process.env.EMAIL_FROM || 'noreply@notestandard.com'}`,
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
      } catch {
        // VAPID details already initialized
      }
    }

    // Resolve Firebase Admin instance
    let fbApp = firebaseApp || (admin.apps.length > 0 ? admin.apps[0] : null);

    const defaultGatewayUrl = process.env.NODE_ENV === 'production' 
      ? 'https://gateway.notestandard.com' 
      : 'http://localhost:5001';

    const resolvedGatewayUrl = process.env.REALTIME_GATEWAY_URL || 
      process.env.GATEWAY_PUBLIC_URL || 
      (gatewayUrl && !gatewayUrl.includes('localhost:5000') ? gatewayUrl : null) || 
      process.env.SELF_URL || 
      defaultGatewayUrl;

    const deliveryWebhookUrl = messageId
      ? `${resolvedGatewayUrl.replace(/\/$/, '')}/deliver/${messageId}?recipientId=${userId}&cid=${correlationId || ''}`
      : '';

    let resolvedUrl = url || link;
    if ((!resolvedUrl || resolvedUrl === '/dashboard/chat' || resolvedUrl === '/dashboard') && conversationId) {
      resolvedUrl = `/dashboard/chat?id=${conversationId}`;
    }
    const targetUrl = resolvedUrl || (conversationId ? `/dashboard/chat?id=${conversationId}` : '/dashboard/chat');

    const results = await Promise.allSettled(
      devices.map(device => PushDispatcher.dispatchToDevice(supabase, fbApp, device, {
        userId,
        title: title || 'New Message',
        body: body || 'You have a new message',
        messageId: messageId || '',
        conversationId: conversationId || '',
        url: targetUrl,
        deliveryWebhookUrl,
        correlationId
      }))
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === false)).length;

    console.log(`[PushDispatcher] Sent ${sent}/${devices.length} push notifications for user ${userId} | cid:${correlationId || 'N/A'}`);
    return { attempted: devices.length, sent, failed };
  }

  /**
   * Routes dispatch to the correct platform handler.
   */
  static async dispatchToDevice(supabase, fbApp, device, payload) {
    const isWebPushUrl = typeof device.endpoint === 'string' && device.endpoint.startsWith('https://');
    const isVapid = device.type === 'vapid' || isWebPushUrl;

    if (isVapid || isWebPushUrl) {
      return PushDispatcher.sendWebPush(supabase, device, payload);
    }

    const isFcmToken = device.type === 'fcm' || 
      (typeof device.endpoint === 'string' && !device.endpoint.startsWith('https://') && !device.endpoint.startsWith('ExponentPushToken'));

    if (device.platform === 'android' && isFcmToken && fbApp) {
      return PushDispatcher.sendAndroidFcm(fbApp, supabase, device, payload);
    }

    if (device.platform === 'ios' && isFcmToken && fbApp) {
      return PushDispatcher.sendIosPush(fbApp, supabase, device, payload);
    }

    return false;
  }

  /**
   * Android FCM Dispatch: High-Priority DUAL-PAYLOAD (notification + data).
   * The notification block ensures Android OS renders a system tray notification
   * even when the app process is killed/closed. The data block wakes the JS thread
   * for delivery ACK and in-app handling when the app is open.
   */
  static async sendAndroidFcm(fbApp, supabase, device, payload) {
    try {
      const message = {
        token: device.endpoint,
        notification: {
          title: String(payload.title || 'New Message'),
          body: String(payload.body || 'You have a new message'),
        },
        data: {
          type: 'chat_message',
          title: String(payload.title),
          body: String(payload.body),
          messageId: String(payload.messageId),
          conversationId: String(payload.conversationId),
          url: String(payload.url || (payload.conversationId ? `/dashboard/chat?id=${payload.conversationId}` : '/dashboard/chat')),
          deliveryWebhookUrl: String(payload.deliveryWebhookUrl),
          recipientId: String(payload.userId),
          targetAccountId: String(payload.userId),
          correlationId: String(payload.correlationId || '')
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
        }
      };

      await fbApp.messaging().send(message);
      console.log(`[PushDispatcher] ✅ Android High-Priority Data FCM sent to ${device.deviceId || 'device'}`);
      return true;
    } catch (err) {
      console.error(`[PushDispatcher] ❌ Android FCM failed for ${device.deviceId}:`, err.message);
      if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
        PushDispatcher.markEndpointInvalid(supabase, device);
      }
      return false;
    }
  }

  /**
   * Web Push (VAPID) Dispatch for Desktop Web & PWA.
   */
  static async sendWebPush(supabase, device, payload) {
    try {
      const rawP256dh = device.p256dh || device.push_p256dh || device.keys?.p256dh;
      const rawAuth = device.auth || device.push_auth || device.keys?.auth;

      const p256dh = normalizeBase64Url(rawP256dh);
      const auth = normalizeBase64Url(rawAuth);

      if (!p256dh || !auth) {
        console.warn(`[PushDispatcher] ⚠️ Skipping Web Push for ${device.endpoint?.slice(0, 30)}... — missing p256dh or auth keys`);
        return false;
      }

      const webPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: '/icon-192.png',
        data: {
          type: 'chat_message',
          messageId: payload.messageId,
          conversationId: payload.conversationId,
          url: (payload.url && payload.url !== '/dashboard/chat' && payload.url !== '/dashboard')
            ? payload.url
            : (payload.conversationId ? `/dashboard/chat?id=${payload.conversationId}` : (payload.url || '/dashboard/chat')),
          recipientId: payload.userId,
          targetAccountId: payload.userId,
          deliveryWebhookUrl: payload.deliveryWebhookUrl,
          correlationId: payload.correlationId
        }
      });

      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh, auth } },
        webPayload,
        {
          headers: {
            Urgency: 'high',
          },
          TTL: 86400,
          urgency: 'high',
        }
      );

      console.log(`[PushDispatcher] ✅ Web Push sent to ${device.platform} endpoint`);
      return true;
    } catch (err) {
      console.error(`[PushDispatcher] ❌ Web Push failed:`, err.message);
      if (err.statusCode === 410 || err.statusCode === 404) {
        PushDispatcher.markEndpointInvalid(supabase, device);
      }
      return false;
    }
  }

  /**
   * iOS APNs / FCM Dispatch.
   */
  static async sendIosPush(fbApp, supabase, device, payload) {
    if (!fbApp) return false;
    try {
      const message = {
        token: device.endpoint,
        notification: {
          title: String(payload.title),
          body: String(payload.body)
        },
        data: {
          type: 'chat_message',
          messageId: String(payload.messageId),
          conversationId: String(payload.conversationId),
          url: String(payload.url || (payload.conversationId ? `/dashboard/chat?id=${payload.conversationId}` : '/dashboard/chat')),
          deliveryWebhookUrl: String(payload.deliveryWebhookUrl)
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              badge: 1,
              sound: 'default'
            }
          }
        }
      };

      await fbApp.messaging().send(message);
      console.log(`[PushDispatcher] ✅ iOS APNs Push sent to ${device.deviceId || 'device'}`);
      return true;
    } catch (err) {
      console.error(`[PushDispatcher] ❌ iOS Push failed:`, err.message);
      if (err.code === 'messaging/registration-token-not-registered') {
        PushDispatcher.markEndpointInvalid(supabase, device);
      }
      return false;
    }
  }

  /**
   * Invalidates revoked/expired endpoints in database.
   */
  static async markEndpointInvalid(supabase, device) {
    try {
      if (device.source === 'device_installations_v2' && device.deviceId) {
        await supabase
          .from('device_installations')
          .update({ endpoint_status: 'INVALID', failure_reason: 'PUSH_SERVICE_EXPIRED' })
          .eq('device_id', device.deviceId);
      } else if (device.source === 'push_subscriptions_v1' && device.endpoint) {
        await supabase
          .from('push_subscriptions')
          .update({ status: 'invalid' })
          .eq('endpoint', device.endpoint);
      }
    } catch (err) {
      console.error('[PushDispatcher] Failed to mark endpoint invalid:', err.message);
    }
  }
}

module.exports = PushDispatcher;
