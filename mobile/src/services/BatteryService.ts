import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@BatteryOptimizationRequested';

class BatteryService {
  async shouldRequestOptimization(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    
    const requested = await AsyncStorage.getItem(STORAGE_KEY);
    if (requested === 'true') return false;
    
    // In a real app, you might use a native module to check 
    // if the permission is already granted (isIgnoringBatteryOptimizations)
    return true;
  }

  async requestIgnoreBatteryOptimization() {
    if (Platform.OS !== 'android') return;

    try {
      // Mark as requested to avoid nag-loops
      await AsyncStorage.setItem(STORAGE_KEY, 'true');

      const packageName = NativeModules.StatusBarManager.packageName || 'com.notestandard.app';
      
      await IntentLauncher.startActivityAsync(
        'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
        { data: `package:${packageName}` }
      );
    } catch (err) {
      console.error('[BatteryService] Failed to launch intent:', err);
      // Fallback to general settings
      Linking.openSettings();
    }
  }

  // Tracking for missed calls logic
  async markMissedCall() {
    await AsyncStorage.setItem('@MissedCallDueToOptimization', 'true');
  }

  async checkMissedCalls(): Promise<boolean> {
    const missed = await AsyncStorage.getItem('@MissedCallDueToOptimization');
    if (missed === 'true') {
      await AsyncStorage.removeItem('@MissedCallDueToOptimization');
      return true;
    }
    return false;
  }
}

export default new BatteryService();
