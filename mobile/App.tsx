import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, LogBox, Platform } from 'react-native';
import CallService from './src/services/CallService';
import { PushHandler } from './src/services/PushHandler';
import SignalingService from './src/services/SignalingService';
import BatteryService from './src/services/BatteryService';
import BatteryOptimizationModal from './src/components/BatteryOptimizationModal';

// Ignore specific warnings for clean dev experience
LogBox.ignoreLogs(['Setting a timer']);

export default function App() {
  const [batteryModalVisible, setBatteryModalVisible] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      console.log('[App] 🚀 Bootstrapping high-reliability services...');
      
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
        // SignalingService.answerCall(...)
      });

      CallService.onReject((callId) => {
        console.log('[App] 🚫 Call Rejected/Ended:', callId);
        // SignalingService.rejectCall(...)
      });

      console.log('[App] ✅ Bootstrap complete.');
    };

    bootstrap();
  }, []);

  const handleAllowCalls = async () => {
    setBatteryModalVisible(false);
    await BatteryService.requestIgnoreBatteryOptimization();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NoteStandard</Text>
      <Text style={styles.subtitle}>Native High-Reliability Signaling Active</Text>
      <StatusBar style="auto" />

      <BatteryOptimizationModal 
        visible={batteryModalVisible}
        onClose={() => setBatteryModalVisible(false)}
        onConfirm={handleAllowCalls}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  subtitle: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
