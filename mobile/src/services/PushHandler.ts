import * as Notifications from 'expo-notifications';
import CallService, { CallData } from './CallService';
import { Platform } from 'react-native';
import EventEmitter from './EventEmitter';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const { data } = notification.request.content;
    
    // Suppress system alert for messages in foreground to use custom UI
    const isMessage = data?.type === 'message' || data?.type === 'chat_message';
    
    return {
      shouldShowAlert: !isMessage, // Only show system alert if it's NOT a message
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

export class PushHandler {
  static async init() {
    console.log('[PushHandler] 🛠️ Initializing Push Integration...');

    // 1. Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[PushHandler] ❌ Notification permissions not granted.');
      return;
    }

    // 2. Get device token (FCM for Android) & Persistent Registration
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync();
      const token = tokenData.data;
      console.log('[PushHandler] 🔑 Current Device Token:', token);

      // REDUNDANCY: Always refresh token in backend on launch 
      // This ensures "Token Freshness" as requested for WhatsApp-level reliability
      await this.registerTokenWithBackend(token);
    } catch (err) {
      console.error('[PushHandler] ❌ Failed to fetch device token:', err);
    }

    // 3. High-Priority Background Listener
    Notifications.addNotificationReceivedListener(notification => {
      const { data, title, body } = notification.request.content;
      console.log('[PushHandler] 🔔 Push Received:', JSON.stringify(data));
      
      if (data.type === 'incoming_call') {
        console.log('[PushHandler] 📞 Native Call Signal detected. Triggering CallService...');
        this.handleIncomingCall(data as unknown as CallData);
      } else if (data.type === 'call_cancelled') {
        console.log('[PushHandler] 🛑 Call Cancellation detected. Dismissing CallService...');
        CallService.rejectCall(); // This will end the native ringing UI
      } else if (data.type === 'message' || data.type === 'chat_message') {
        // Emit for custom in-app notification
        EventEmitter.emit('notification', {
          title: title || data.title || 'New Message',
          message: body || data.message || '',
          type: data.type
        });
      }
    });

    // 4. Handle notification response
    Notifications.addNotificationResponseReceivedListener(response => {
      const { data } = response.notification.request.content;
      console.log('[PushHandler] 👆 Interaction detected:', data);
    });

    console.log('[PushHandler] ✅ Initialization finished.');
  }

  static async registerTokenWithBackend(token: string) {
    console.log('[PushHandler] 📡 Registering token with backend...');
    try {
      const response = await fetch('http://localhost:5000/api/notifications/register-native-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          platform: Platform.OS,
          type: Platform.OS === 'android' ? 'fcm' : 'voip'
        })
      });
      const resData = await response.json();
      if (resData.success) {
        console.log('[PushHandler] ✅ Token registered successfully.');
      } else {
        console.error('[PushHandler] ❌ Token registration error:', resData.error);
      }
    } catch (err) {
      console.warn('[PushHandler] ⚠️ Token registration failed (Backend may be offline):', err);
    }
  }

  static handleIncomingCall(data: CallData) {
    console.log('[PushHandler] 🎬 Delegating to CallService:', data);
    CallService.displayIncomingCall(data);
  }
}

// Background Task (Android Only - Expo Notifications handles this via separate mechanism or custom dev client)
// For a production app with CallKeep, standard practice is to use a Headless JS task or 
// have the native side trigger displayIncomingCall directly.
// In Expo Dev Client, background notifications trigger the app's JS bundle.
