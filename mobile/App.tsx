import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, LogBox, Platform, SafeAreaView } from 'react-native';
import CallService from './src/services/CallService';
import { PushHandler } from './src/services/PushHandler';
import SignalingService from './src/services/SignalingService';
import BatteryService from './src/services/BatteryService';
import BatteryOptimizationModal from './src/components/BatteryOptimizationModal';
import { FriendsList } from './src/components/FriendsList';
import { AuthService } from './src/services/AuthService';

// Ignore specific warnings for clean dev experience
LogBox.ignoreLogs(['Setting a timer']);

import { NotificationProvider } from './src/context/NotificationContext';

export default function App() {
  const [batteryModalVisible, setBatteryModalVisible] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      console.log('[App] 🚀 Bootstrapping high-reliability services...');
      
      // Temporary Auth Simulation for Testing
      const hasToken = await AuthService.isAuthenticated();
      if (!hasToken) {
        console.log('[App] 🔐 Simulating Auth for onomejohn107@gmail.com...');
        // In a real app, this would be a login screen. 
        // For now, we'll assume the user is logged in if we are in this test environment.
        await AuthService.setToken('SIMULATED_TOKEN'); // Replace with real token if testing with backend
        await AuthService.setUser({
          id: 'onome-uid-123',
          email: 'onomejohn107@gmail.com',
          full_name: 'Onome John'
        });
      }

      // 1. Setup Native Call UI
      await CallService.setup();

      // 2. Initialize Push Notifications & Token Refresh
      await PushHandler.init();

      // 3. Battery Optimization Check (Android Only)
      if (Platform.OS === 'android') {
        const shouldRequest = await BatteryService.shouldRequestOptimization();
        const hadMissedCall = await BatteryService.checkMissedCalls();
        
        if (shouldRequest || hadMissedCall) {
          console.log('[App] 🔋 Battery optimization check triggered');
          setBatteryModalVisible(true);
        }
      }

      // 4. Setup Call Event Listeners
      CallService.onAnswer((callId) => {
        console.log('[App] ✅ Call Answered:', callId);
      });

      CallService.onReject((callId) => {
        console.log('[App] 🚫 Call Rejected/Ended:', callId);
      });

      setIsReady(true);
      console.log('[App] ✅ Bootstrap complete.');
    };

    bootstrap();
  }, []);

  const handleAllowCalls = async () => {
    setBatteryModalVisible(false);
    await BatteryService.requestIgnoreBatteryOptimization();
  };

  if (!isReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Initializing...</Text>
      </View>
    );
  }

  return (
    <NotificationProvider>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <FriendsList />
          <StatusBar style="light" />

          <BatteryOptimizationModal 
            visible={batteryModalVisible}
            onClose={() => setBatteryModalVisible(false)}
            onConfirm={handleAllowCalls}
          />
        </View>
      </SafeAreaView>
    </NotificationProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
});
