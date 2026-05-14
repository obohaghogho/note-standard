import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { Platform, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { NotificationProvider } from './src/context/NotificationContext';
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

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppNavigator />
          {/* In-app VoIP incoming call modal – rendered globally so it works from any screen */}
          <IncomingCallModal />
          <StatusBar style="light" />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
