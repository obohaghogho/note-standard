import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import { API_URL } from './src/Config';

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
    }
  } catch (e) {
    console.error('[FCM Background] Failed to trigger delivery webhook:', e);
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
