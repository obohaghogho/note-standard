import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import RNCallKeep from 'react-native-callkeep';
import App from './App';

// Headless JS task to wake up Android on incoming VoIP calls
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[Background] Headless FCM payload received:', remoteMessage.data);
  if (remoteMessage.data && remoteMessage.data.type === 'incoming_call') {
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

      const callUUID = remoteMessage.data.call_id || Math.random().toString();
      const callerName = remoteMessage.data.caller_name || 'Someone';
      const isVideo = remoteMessage.data.call_type === 'video';
      
      RNCallKeep.displayIncomingCall(callUUID, callerName, callerName, 'generic', isVideo);
    } catch (e) {
      console.error('[Background] CallKeep setup/display failed:', e);
    }
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);
