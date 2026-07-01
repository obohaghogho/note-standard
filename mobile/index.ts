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
  console.log('[FCM Background] Token refreshed natively:', token.substring(0, 10) + '...');
  try {
    await PushHandler.registerTokenWithBackend(token, 'fcm');
  } catch (e) {
    console.error('[FCM Background] Failed to sync refreshed token:', e);
  }
});

// ── INSTRUMENTED Headless background handler for Push Notifications ──────────
// This handler is the critical evidence point. If [EVIDENCE] BACKGROUND_HANDLER_EXECUTED
// appears in the Gateway logs, the React Native JS thread successfully woke up.
// If that log is absent, the OS intercepted the push as a "Notification Message"
// and silently prevented the JS thread from executing.
messaging().setBackgroundMessageHandler(async remoteMessage => {
  // TIMELINE STEP 1: JS thread is alive — capture the exact moment
  const handlerStartTs = Date.now();
  const fcmReceivedTs = remoteMessage.sentTime || handlerStartTs;

  // Capture app state at the moment of handler entry.
  // Note: AppState from react-native may not be importable in headless mode.
  // We use a try/catch and default to 'background' (the handler won't run in foreground).
  // Android headless tasks run when app is TERMINATED (state reported as 'background' by RN)
  // vs truly background (app process alive but screen off).
  let app_state = 'background'; // default assumption
  try {
    const { AppState } = require('react-native');
    app_state = AppState.currentState || 'background';
  } catch (_) {
    // In headless/terminated state, AppState may not be accessible
    app_state = 'terminated_or_headless';
  }

  console.log(`[EVIDENCE] BACKGROUND_HANDLER_STARTED | app_state:${app_state} | handlerStartTs:${handlerStartTs} | fcmReceivedTs:${fcmReceivedTs} | type:${remoteMessage.data?.type || 'N/A'} | messageId:${remoteMessage.data?.messageId || 'N/A'}`);
  console.log(`[EVIDENCE] FCM_REMOTE_MESSAGE_RAW | ${JSON.stringify({ data: remoteMessage.data, notification: remoteMessage.notification, sentTime: remoteMessage.sentTime })}`);

  try {
    const data = remoteMessage.data;

    if ((data?.type === 'chat_message' || data?.type === 'message') && data?.messageId) {
      const messageId = data.messageId;
      const conversationId = data.conversationId || 'unknown';

      // Phase 6 fix: Prefer the gateway fast-path URL embedded in the push payload.
      // The gateway is always awake (it holds the sender's socket).
      // The API server may be asleep on Render free-tier (30-90 s cold start).
      const baseWebhookUrl = (typeof data.deliveryWebhookUrl === 'string' && data.deliveryWebhookUrl)
        ? data.deliveryWebhookUrl
        : `https://realtime-gateway-gsb5.onrender.com/deliver/${messageId}`;

      const webhookSentTs = Date.now();

      try {
        // Post the delivery webhook WITH diagnostic probe fields.
        // The gateway's /deliver/:messageId endpoint reads these optional fields and
        // logs [EVIDENCE] BACKGROUND_HANDLER_EXECUTED — providing server-side proof
        // that the mobile JS thread woke up without adding any new endpoints.
        await fetch(baseWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Diagnostic probe (read by the enriched /deliver endpoint)
            handlerExecuted: true,
            app_state,
            userId: data.recipientId || data.targetAccountId || 'unknown',
            conversationId,
            timeline: {
              fcmReceivedTs,
              handlerStartTs,
              webhookSentTs,
            },
          }),
        });
        console.log(`[EVIDENCE] DELIVERY_WEBHOOK_SENT | messageId:${messageId} | url:${baseWebhookUrl} | webhookSentTs:${webhookSentTs} | gatewayLatencyMs:${Date.now() - webhookSentTs}`);
      } catch (webhookErr: any) {
        console.warn(`[EVIDENCE] DELIVERY_WEBHOOK_FAILED | messageId:${messageId} | error:${webhookErr?.message}`);
      }

      // ── Manual notification display (required for Data-Only messages) ──────
      // For Notification Messages, the OS renders the UI automatically.
      // For Data-Only messages (the permanent fix), the JS thread must render manually.
      // We display it here regardless so we cover both cases during the diagnostic phase.
      try {
        const { default: Notifications } = await import('expo-notifications');
        const title = remoteMessage.notification?.title || data.senderName || 'New Message';
        const body  = remoteMessage.notification?.body  || data.content   || 'You have a new message';

        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: {
              type: data.type,
              messageId,
              conversationId,
              url: data.url || '/dashboard/chat',
            },
            sound: true,
          },
          trigger: null, // display immediately
        });
        console.log(`[EVIDENCE] LOCAL_NOTIFICATION_DISPLAYED | messageId:${messageId} | title:"${title}" | ts:${Date.now()}`);
      } catch (notifErr: any) {
        console.warn(`[EVIDENCE] LOCAL_NOTIFICATION_FAILED | messageId:${messageId} | error:${notifErr?.message}`);
      }

    } else if (data?.type === 'incoming_call' && Platform.OS === 'android') {
      console.log('[FCM Background] Incoming call detected. Triggering CallService...');
      const callId = typeof data.call_id === 'string' ? data.call_id : typeof data.sessionId === 'string' ? data.sessionId : typeof data.caller_id === 'string' ? data.caller_id : uuidv4();
      const callerName = typeof data.caller_name === 'string' ? data.caller_name : typeof data.callerName === 'string' ? data.callerName : 'Someone';

      const callType = (data.callType === 'video' || (data.type as any) === 'video') ? 'video' : 'audio';
      const callerId = typeof data.callerId === 'string' ? data.callerId : typeof data.from === 'string' ? data.from : '';
      const conversationId = typeof data.conversationId === 'string' ? data.conversationId : '';
      const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;

      CallService.displayIncomingCall({
        uuid: callId,
        callerId,
        callerName,
        callType,
        conversationId,
        sessionId,
      });
    } else {
      console.log(`[EVIDENCE] BACKGROUND_HANDLER_UNHANDLED_TYPE | type:${data?.type || 'undefined'} | ts:${Date.now()}`);
    }
  } catch (e: any) {
    console.error(`[EVIDENCE] BACKGROUND_HANDLER_ERROR | error:${e?.message} | ts:${Date.now()}`);
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
