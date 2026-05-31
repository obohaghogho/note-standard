import * as Notifications from 'expo-notifications';
import CallService, { CallData } from './CallService';
import SignalingService from './SignalingService';
import { Platform } from 'react-native';
import EventEmitter from './EventEmitter';
import VoipPushNotification from 'react-native-voip-push-notification';
import RNCallKeep from 'react-native-callkeep';
import messaging from '@react-native-firebase/messaging';
import { navigate } from '../navigation/AppNavigator';
import apiClient from '../api/apiClient';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const { data } = notification.request.content;
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

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    this.setupCallKeepListeners();

    if (Platform.OS === 'ios') {
      this.setupVoIP();
    }

    if (finalStatus === 'granted') {
      this.registerDeviceToken().catch(err => {
        console.warn('[PushHandler] Graceful initial register Device Token fail:', err);
      });
    } else {
      console.warn(`[PushHandler] ⚠️ Push permission not granted (status: ${finalStatus}). Device token registration skipped.`);
    }

    // Foreground listener for React Native Firebase Messaging (Data-only pushes)
    messaging().onMessage(async remoteMessage => {
      console.log('[PushHandler] 🔔 Firebase Foreground Message:', remoteMessage.data);
      if (remoteMessage.data && remoteMessage.data.type === 'incoming_call' && Platform.OS === 'android') {
        this.handleIncomingCall(remoteMessage.data as unknown as CallData);
      }
    });

    Notifications.addNotificationReceivedListener(notification => {
      const { data, title, body } = notification.request.content;
      console.log('[PushHandler] 🔔 Standard Push Received:', JSON.stringify(data));
      
      if (data.type === 'incoming_call' && Platform.OS === 'android') {
        this.handleIncomingCall(data as unknown as CallData);
      } else if (data.type === 'message' || data.type === 'chat_message') {
        if (data.messageId) {
          apiClient.post(`/chat/messages/${data.messageId}/webhook-deliver`).catch(e => {
            console.error('[PushHandler] Delivery receipt failed:', e);
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

  static handleIncomingCall(data: any) {
    console.log('[PushHandler] Handling incoming call payload:', data);

    const callerId       = data.callerId || data.caller_id || '';
    const callerName     = data.callerName || data.caller_name || 'Someone';
    const callType: 'audio' | 'video' = (data.callType || data.call_type || 'audio') === 'video' ? 'video' : 'audio';
    const conversationId = data.conversationId || data.conversation_id || '';
    const sessionId      = data.sessionId || data.call_id || '';

    // BUG FIX (Bug 6): The push notification path bypasses SignalingService's
    // socket 'call:incoming' handler, so SignalingService never gets the session
    // context. When the user answers, answerCall() emits { sessionId: null },
    // which breaks call tracking on the gateway and in the DB.
    // Fix: sync SignalingService state directly from the push payload.
    SignalingService.activeTargetId       = callerId;
    SignalingService.activeConversationId = conversationId;
    SignalingService.activeCallType       = callType;
    SignalingService.activeSessionId      = sessionId;

    CallService.displayIncomingCall({
      callerId,
      callerName,
      callType,
      conversationId,
      sessionId,
    }).catch(e => console.error('[PushHandler] Call display failed:', e));
  }

  static async registerDeviceToken() {
    console.log('[PushHandler] 📡 Fetching and registering device tokens...');
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync();
      const token = tokenData.data;
      await this.registerTokenWithBackend(token, Platform.OS === 'ios' ? 'apns' : 'fcm');
    } catch (err) {
      console.error('[PushHandler] ❌ Failed to fetch standard device token:', err);
    }

    if (Platform.OS === 'ios') {
      try {
        VoipPushNotification.registerVoipToken();
      } catch (err) {
        console.error('[PushHandler] ❌ Failed to request iOS VoIP token:', err);
      }
    }
  }

  static setupCallKeepListeners() {
    console.log('[PushHandler] 🤖 Setting up global CallKeep listeners...');
    
    RNCallKeep.addEventListener('answerCall', async ({ callUUID }) => {
      console.log('[PushHandler] 📞 Native CallKit/ConnectionService answered:', callUUID);
      await CallService.answerCall(callUUID);
      
      // Navigate to the call screen automatically
      const callData = CallService.getCurrentCall();
      if (callData) {
        SignalingService.activeTargetId = callData.callerId;
        SignalingService.activeConversationId = callData.conversationId;
        SignalingService.activeCallType = callData.callType;
        SignalingService.activeSessionId = callData.sessionId || null;

        await SignalingService.answerCall();
        navigate('Call', {
          type: callData.callType,
          conversationId: callData.conversationId,
          targetUserId: callData.callerId,
          targetName: callData.callerName,
          isIncoming: true,
        });
      }
      
      if (Platform.OS === 'android') {
        RNCallKeep.backToForeground();
      }
    });

    RNCallKeep.addEventListener('endCall', async ({ callUUID }) => {
      console.log('[PushHandler] 📵 Native CallKit/ConnectionService rejected/ended:', callUUID);
      await SignalingService.rejectIncomingCall();
      CallService.rejectCall(callUUID);
    });
  }

  static setupVoIP() {
    console.log('[PushHandler] 🍎 Setting up iOS VoIP (PushKit)...');
    
    VoipPushNotification.addEventListener('register', (token) => {
      console.log('[PushHandler] 🔑 iOS VoIP Token Received:', token);
      this.registerTokenWithBackend(token, 'voip', 0);
    });

    VoipPushNotification.addEventListener('notification', (notification: any) => {
      console.log('[PushHandler] 📞 iOS VoIP Push Received:', JSON.stringify(notification));
      
      const callData = {
        uuid: notification.uuid, // Pass exact CallKit UUID from Apple PushKit
        callerId: notification.callerId || notification.from,
        callerName: notification.callerName || notification.fromName,
        callType: notification.callType || notification.type,
        conversationId: notification.conversationId,
        peerId: notification.peerId || notification.from,
        sessionId: notification.sessionId
      } as CallData;

      if (notification.type === 'incoming_call' || notification.type === 'call_incoming') {
        // MUST report new incoming call to CallKit immediately
        this.handleIncomingCall(callData);
      } else if (notification.type === 'call_cancelled') {
        CallService.rejectCall(notification.uuid);
      }
      
      (VoipPushNotification as any).onFinishNotification(notification.uuid);
    });
  }

  static async registerTokenWithBackend(token: string, type: 'fcm' | 'voip' | 'apns', retryCount = 0) {
    console.log(`[PushHandler] 📡 Registering ${type} token with backend (Try: ${retryCount + 1})...`);
    try {
      const { getDeviceId } = require('../utils/notifications');
      const deviceId = await getDeviceId();
      const response = await apiClient.post(`/notifications/register-native-token`, {
        token, platform: Platform.OS, type, deviceId
      });
      if (response.data.success) {
        console.log(`[PushHandler] ✅ ${type} token registered successfully.`);
      } else {
        throw new Error(response.data.error || 'Unknown error');
      }
    } catch (err: any) {
      if (retryCount < 3 && (!err.response || err.response.status >= 500)) {
          setTimeout(() => this.registerTokenWithBackend(token, type, retryCount + 1), 5000);
      }
    }
  }

}
