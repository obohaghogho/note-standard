import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import RNCallKeep from 'react-native-callkeep';
import App from './App';

// Headless JS task to wake up Android on incoming VoIP calls and process background data
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[Background] Headless FCM payload received:', remoteMessage.data);
  const data = remoteMessage.data;
  
  if (data) {
    if (data.type === 'incoming_call') {
      try {
        RNCallKeep.setup({
          ios: { appName: 'NoteStandard' },
          android: {
            alertTitle: 'Permissions required',
            alertDescription: 'This application needs to access your phone accounts',
            cancelButton: 'Cancel',
            okButton: 'ok',
            additionalPermissions: [],
          }
        });
        RNCallKeep.setAvailable(true);

        const callUUID = data.call_id || Math.random().toString();
        const callerName = data.caller_name || 'Someone';
        const isVideo = data.call_type === 'video';
        
        RNCallKeep.displayIncomingCall(callUUID, callerName, callerName, 'generic', isVideo);
      } catch (e) {
        console.error('[Background] CallKeep setup/display failed:', e);
      }
    } else if (data.type === 'message' || data.type === 'chat_message' || data.title || data.body || data.message) {
      // Process delivery receipt in the background so the sender sees double-ticks
      const messageId = data.messageId;
      if (messageId) {
        try {
          const { API_URL } = require('./src/Config');
          await fetch(`${API_URL}/api/chat/messages/${messageId}/webhook-deliver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          console.log(`[Background] Delivery receipt sent for message: ${messageId}`);
        } catch (e) {
          console.error('[Background] Delivery receipt failed:', e);
        }
      }

      // Present local notification banner so user sees notification tray item on Android when app is in background or killed
      try {
        const Notifications = require('expo-notifications');
        const notifTitle = data.title || (data.type === 'message' || data.type === 'chat_message' ? 'New Message' : 'NoteStandard Notification');
        const notifBody = data.message || data.body || data.content || '';
        
        await Notifications.scheduleNotificationAsync({
          content: {
            title: notifTitle,
            body: notifBody,
            data: data,
            sound: 'default',
          },
          trigger: null,
        });
        console.log('[Background] Local notification presented for FCM data message:', notifTitle);
      } catch (nErr) {
        console.warn('[Background] Local notification presentation warning:', nErr);
      }
    }
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);
