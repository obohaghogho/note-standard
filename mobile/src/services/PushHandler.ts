import * as Notifications from 'expo-notifications';
import CallService, { CallData } from './CallService';
import { Platform } from 'react-native';
import EventEmitter from './EventEmitter';
import VoipPushNotification from 'react-native-voip-push-notification';
import { AuthService } from './AuthService';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const { data } = notification.request.content;
    
    // Suppress system alert for messages in foreground to use custom UI
    const isMessage = data?.type === 'message' || data?.type === 'chat_message';
    
    return {
      shouldShowAlert: !isMessage,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

export class PushHandler {
  static async init() {
    console.log('[PushHandler] 🛠️ Initializing Push Integration...');

    // 1. Request standard permissions (for chat messages)
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    // 2. iOS VoIP Push Registration (CRITICAL for Ringing Parity)
    if (Platform.OS === 'ios') {
      this.setupVoIP();
    }

    // 3. Get standard device token (FCM for Android, APNs for iOS Chat)
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync();
      const token = tokenData.data;
      console.log('[PushHandler] 🔑 Standard Device Token:', token);
      await this.registerTokenWithBackend(token, 'fcm'); // FCM for Android, standard APNs for iOS
    } catch (err) {
      console.error('[PushHandler] ❌ Failed to fetch standard device token:', err);
    }

    // 4. Listeners
    Notifications.addNotificationReceivedListener(notification => {
      const { data, title, body } = notification.request.content;
      console.log('[PushHandler] 🔔 Standard Push Received:', JSON.stringify(data));
      
      if (data.type === 'incoming_call' && Platform.OS === 'android') {
        // Android handles call signaling via standard high-priority FCM
        this.handleIncomingCall(data as unknown as CallData);
      } else if (data.type === 'message' || data.type === 'chat_message') {
        EventEmitter.emit('notification', {
          title: title || data.title || 'New Message',
          message: body || data.message || '',
          type: data.type
        });
      }
    });

    Notifications.addNotificationResponseReceivedListener(response => {
      const { data } = response.notification.request.content;
      console.log('[PushHandler] 👆 Interaction detected:', data);
    });

    console.log('[PushHandler] ✅ Initialization finished.');
  }

  static setupVoIP() {
    console.log('[PushHandler] 🍎 Setting up iOS VoIP (PushKit)...');
    
    VoipPushNotification.addEventListener('register', (token) => {
      console.log('[PushHandler] 🔑 iOS VoIP Token Received:', token);
      this.registerTokenWithBackend(token, 'voip');
    });

    VoipPushNotification.addEventListener('notification', (notification) => {
      console.log('[PushHandler] 📞 iOS VoIP Push Received:', JSON.stringify(notification));
      
      // VoIP notifications on iOS MUST trigger CallKit immediately
      if (notification.type === 'incoming_call') {
        this.handleIncomingCall(notification as unknown as CallData);
      } else if (notification.type === 'call_cancelled') {
        CallService.rejectCall();
      }
      
      // VoIP notifications must be marked as finished to avoid system termination
      VoipPushNotification.onFinishNotification(notification.uuid);
    });

    // Request VoIP token
    VoipPushNotification.registerVoipToken();
  }

  static async registerTokenWithBackend(token: string, type: 'fcm' | 'voip' | 'apns') {
    console.log(`[PushHandler] 📡 Registering ${type} token with backend...`);
    try {
      const authHeader = await AuthService.getToken();
      
      // Use the correct API URL from Config if available, otherwise fallback
      const baseUrl = 'https://note-standard-api.onrender.com'; // Adjust to your actual production URL
      
      const response = await fetch(`${baseUrl}/api/notifications/register-native-token`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authHeader}`
        },
        body: JSON.stringify({
          token,
          platform: Platform.OS,
          type: type,
        })
      });
      
      const resData = await response.json();
      if (resData.success) {
        console.log(`[PushHandler] ✅ ${type} token registered successfully.`);
      }
    } catch (err) {
      console.warn(`[PushHandler] ⚠️ ${type} token registration failed:`, err);
    }
  }

  static handleIncomingCall(data: CallData) {
    console.log('[PushHandler] 🎬 Triggering CallKit/Ringing:', data);
    CallService.displayIncomingCall(data);
  }
}
