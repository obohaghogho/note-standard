import 'react-native-get-random-values';
import React, { useEffect, useRef } from 'react';
import { Platform, LogBox, AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { NotificationProvider } from './src/context/NotificationContext';
import { ChatProvider } from './src/context/ChatContext';
import { PushHandler } from './src/services/PushHandler';
import BatteryService from './src/services/BatteryService';


// Suppress known dev-only warnings
LogBox.ignoreLogs([
  'Setting a timer',
  'VirtualizedLists should never be nested',
  'Non-serializable values were found in the navigation state',
]);

import IncomingCallModal from './src/components/IncomingCallModal';

export default function App() {
  useEffect(() => {
    const bootstrap = async () => {
      console.log('[App] Bootstrapping background services...');

      // Firebase push notifications
      await PushHandler.init();

      // Battery optimization prompt (Android only)
      if (Platform.OS === 'android') {
        try {
          const shouldRequest = await BatteryService.shouldRequestOptimization();
          const hadMissedCall = await BatteryService.checkMissedCalls();
          if (shouldRequest || hadMissedCall) {
            await BatteryService.requestIgnoreBatteryOptimization();
          }
        } catch (err) {
          console.warn('[App] Battery optimization check failed:', err);
        }
      }

      console.log('[App] Bootstrap complete.');
    };

    bootstrap();
  }, []);

  // Self-healing token mechanism:
  // Re-verify token registration every time the app comes to the foreground.
  // This catches cases where initial registration failed due to network, or
  // tokens were invalidated while the app was backgrounded.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[App] 🔄 App came to foreground. Re-verifying push tokens...');
        PushHandler.init().catch(err => {
          console.warn('[App] Foreground token re-verification failed:', err);
        });
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ChatProvider>
          <NotificationProvider>
            <AppNavigator />
            {/* In-app VoIP incoming call modal – rendered globally so it works from any screen */}
            <IncomingCallModal />
            <StatusBar style="light" />
          </NotificationProvider>
        </ChatProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
