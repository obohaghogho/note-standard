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

// Headless background handler for Push Notifications
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[FCM Background] Message handled in the background!', remoteMessage);
  
  try {
    const data = remoteMessage.data;
    if ((data?.type === 'chat_message' || data?.type === 'message') && data?.messageId) {
       const messageId = data.messageId;
       const url = `${API_URL}/api/chat/messages/${messageId}/webhook-deliver`;
       await fetch(url, { method: 'POST' });
       console.log('[FCM Background] Delivery webhook triggered for message:', messageId);
    } else if (data?.type === 'incoming_call' && Platform.OS === 'android') {
       console.log('[FCM Background] Incoming call detected. Triggering CallKeep...');
       const callId = data.call_id || data.sessionId || data.caller_id || 'unknown';
       const callerName = data.caller_name || 'Someone';
       // displayIncomingCall(uuid, handle, handleType = 'number', hasVideo = false, localizedCallerName = '')
       RNCallKeep.displayIncomingCall(callId, callerName, callerName, 'generic', data.call_type === 'video');
    }
  } catch (e) {
    console.error('[FCM Background] Failed to trigger delivery webhook:', e);
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
