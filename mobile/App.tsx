import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { Platform, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { NotificationProvider } from './src/context/NotificationContext';
import CallService from './src/services/CallService';
import { PushHandler } from './src/services/PushHandler';
import BatteryService from './src/services/BatteryService';
import SignalingService from './src/services/SignalingService';

// Suppress noisy dev-only warnings
LogBox.ignoreLogs(['Setting a timer', 'VirtualizedLists should never be nested']);

export default function App() {
  useEffect(() => {
    const bootstrap = async () => {
      console.log('[App] Bootstrapping background services...');

      // 1. Native call UI (CallKeep)
      await CallService.setup();

      // 2. Firebase push notification handler
      await PushHandler.init();

      // 3. Battery optimization prompt (Android 14+ compliance)
      if (Platform.OS === 'android') {
        const shouldRequest = await BatteryService.shouldRequestOptimization();
        const hadMissedCall = await BatteryService.checkMissedCalls();
        if (shouldRequest || hadMissedCall) {
          await BatteryService.requestIgnoreBatteryOptimization();
        }
      }

      // 4. Call event listeners
      CallService.onAnswer((callId: string) => {
        console.log('[App] Call Answered:', callId);
      });
      CallService.onReject((callId: string) => {
        console.log('[App] Call Rejected:', callId);
        SignalingService.cancelActiveCall();
      });
      CallService.onEndCall((callId: string) => {
        console.log('[App] Call Ended from System:', callId);
        SignalingService.cancelActiveCall();
      });

      console.log('[App] Bootstrap complete.');
    };

    bootstrap();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppNavigator />
          <StatusBar style="light" />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
