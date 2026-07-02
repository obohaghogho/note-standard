import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import RNCallKeep from 'react-native-callkeep';
import { Platform } from 'react-native';
import { API_URL } from './src/Config';

const callKeepOptions = {
  ios: {
    appName: 'NoteStandard',
  },
  android: {
    alertTitle: 'Permissions required',
    alertDescription: 'This application needs to access your phone accounts',
    cancelButton: 'Cancel',
    okButton: 'ok',
    imageName: 'phone_account_icon',
    additionalPermissions: [],
    selfManaged: true,
  }
};

try {
  RNCallKeep.setup(callKeepOptions);
  RNCallKeep.setAvailable(true);
} catch (err) {
  console.error('[CallKeep] Setup error:', err);
}

import App from './App';
import { PushHandler } from './src/services/PushHandler';
import CallService from './src/services/CallService';
import { v4 as uuidv4 } from 'uuid';

// Bind CallKeep listeners globally so they work in headless mode
PushHandler.setupCallKeepListeners();

// Handle Android FCM token rotation in the background
messaging().onTokenRefresh(async (token) => {
  console.log('[FCM] Token refreshed:', token.substring(0, 10) + '...');
  try {
    await PushHandler.registerTokenWithBackend(token, 'fcm');
  } catch (e) {
    console.error('[FCM] Failed to sync refreshed token:', e);
  }
});

// ─── Headless background / terminated message handler ────────────────────────
//
// ARCHITECTURE: All chat FCM payloads are Data-Only messages (no notification
// block). This guarantees that Android always routes the push here rather than
// to the OS notification tray, giving the JS thread full control over:
//   1. Showing a local notification (correct channel, sound, deep-link data)
//   2. Firing the delivery webhook (double-tick on the sender's screen)
//
// This handler runs in a headless React Native task when the app is terminated.
// It MUST be registered before registerRootComponent().
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[FCM] Background/terminated push received | type:', remoteMessage.data?.type, '| messageId:', remoteMessage.data?.messageId);

  try {
    const data = remoteMessage.data;

    // ── Chat message: show notification + fire delivery webhook ──────────────
    if ((data?.type === 'chat_message' || data?.type === 'message') && data?.messageId) {
      const messageId = data.messageId;
      const conversationId = data.conversationId || '';

      // 1. Display the notification via expo-notifications.
      //    Because the FCM payload is data-only, the OS will NOT auto-display
      //    anything — we must render it manually here.
      try {
        const Notifications = await import('expo-notifications');
        const title = (typeof data.title === 'string' && data.title) ? data.title : 'New Message';
        const body  = (typeof data.body  === 'string' && data.body)  ? data.body  : 'You have a new message';

        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: {
              type: 'chat_message',
              messageId,
              conversationId,
              url: typeof data.url === 'string' ? data.url : '/dashboard/chat',
            },
            sound: true,
            // Android: must match a registered channel. expo-notifications
            // auto-creates 'default' with HIGH importance on first use.
            // PushHandler.init() also ensures this channel exists at boot.
          },
          trigger: null, // fire immediately
        });
        console.log('[FCM] Local notification displayed | messageId:', messageId);
      } catch (notifErr: any) {
        console.warn('[FCM] Local notification failed | messageId:', messageId, '| error:', notifErr?.message);
      }

      // 2. Fire the delivery webhook so the sender gets a double-tick.
      //    Use the gateway fast-path URL embedded in the push payload — the
      //    gateway is always awake (it holds live socket connections).
      //    The API server on Render free-tier may be cold (30-90 s delay).
      const webhookUrl = (typeof data.deliveryWebhookUrl === 'string' && data.deliveryWebhookUrl)
        ? data.deliveryWebhookUrl
        : `https://realtime-gateway-gsb5.onrender.com/deliver/${messageId}`;

      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId, conversationId }),
        });
        console.log('[FCM] Delivery webhook sent | messageId:', messageId);
      } catch (webhookErr: any) {
        console.warn('[FCM] Delivery webhook failed | messageId:', messageId, '| error:', webhookErr?.message);
      }

    // ── Incoming call: wake CallService ──────────────────────────────────────
    } else if (data?.type === 'incoming_call' && Platform.OS === 'android') {
      console.log('[FCM] Incoming call push received');
      const callId     = typeof data.call_id   === 'string' ? data.call_id   :
                         typeof data.sessionId  === 'string' ? data.sessionId  :
                         typeof data.caller_id  === 'string' ? data.caller_id  : uuidv4();
      const callerName = typeof data.caller_name === 'string' ? data.caller_name :
                         typeof data.callerName   === 'string' ? data.callerName  : 'Someone';
      const callType   = (data.callType === 'video' || (data.type as any) === 'video') ? 'video' : 'audio';
      const callerId       = typeof data.callerId       === 'string' ? data.callerId       :
                             typeof data.from           === 'string' ? data.from           : '';
      const conversationId = typeof data.conversationId === 'string' ? data.conversationId : '';
      const sessionId      = typeof data.sessionId      === 'string' ? data.sessionId      : undefined;

      CallService.displayIncomingCall({ uuid: callId, callerId, callerName, callType, conversationId, sessionId });

    } else {
      console.log('[FCM] Background push unhandled type:', data?.type || 'undefined');
    }
  } catch (e: any) {
    console.error('[FCM] Background handler error:', e?.message);
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App).
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(App);
