import * as Notifications from 'expo-notifications';
import CallService, { CallData } from './CallService';
import { Platform } from 'react-native';
import EventEmitter from './EventEmitter';
import VoipPushNotification from 'react-native-voip-push-notification';
import { AuthService } from './AuthService';
import apiClient from '../api/apiClient';

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
    } as any;
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
        // Trigger delivery receipt if messageId is available
        if (data.messageId) {
          apiClient.post(`/chat/messages/${data.messageId}/webhook-deliver`).catch(e => {
            console.error('[PushHandler] Foreground delivery receipt failed:', e);
          });
        }
        
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
      this.registerTokenWithBackend(token, 'voip', 0); // Start with 0 retries
    });

    VoipPushNotification.addEventListener('notification', (notification: any) => {
      console.log('[PushHandler] 📞 iOS VoIP Push Received:', JSON.stringify(notification));
      
      // VoIP notifications on iOS MUST trigger CallKit immediately
      const callData = {
        callerId: notification.callerId || notification.from,
        callerName: notification.callerName || notification.fromName,
        callType: notification.callType || notification.type,
        conversationId: notification.conversationId,
        peerId: notification.peerId || notification.from
      };

      if (notification.type === 'incoming_call' || notification.type === 'call_incoming') {
        this.handleIncomingCall(callData as unknown as CallData);
      } else if (notification.type === 'call_cancelled') {
        CallService.rejectCall();
      }
      
      (VoipPushNotification as any).onFinishNotification(notification.uuid);
    });

    // Request VoIP token
    VoipPushNotification.registerVoipToken();
  }

  static async registerTokenWithBackend(token: string, type: 'fcm' | 'voip' | 'apns', retryCount = 0) {
    console.log(`[PushHandler] 📡 Registering ${type} token with backend (Try: ${retryCount + 1})...`);
    try {
      const response = await apiClient.post(`/notifications/register-native-token`, {
        token,
        platform: Platform.OS,
        type
      });
      
      const resData = response.data;
      if (resData.success) {
        console.log(`[PushHandler] ✅ ${type} token registered successfully.`);
      } else {
        throw new Error(resData.error || 'Unknown error');
      }
    } catch (err: any) {
      console.warn(`[PushHandler] ⚠️ ${type} token registration failed:`, err?.response?.data || err.message || err);
      // Only retry on network errors or 500s, not 401s (since apiClient handles 401s globally)
      if (retryCount < 3 && (!err.response || err.response.status >= 500)) {
          console.log(`[PushHandler] 🔄 Retrying ${type} registration in 5s...`);
          setTimeout(() => this.registerTokenWithBackend(token, type, retryCount + 1), 5000);
      }
    }
  }

  static handleIncomingCall(data: CallData) {
    console.log('[PushHandler] 🎬 Triggering CallKit/Ringing:', data);
    CallService.displayIncomingCall(data);
  }
}
