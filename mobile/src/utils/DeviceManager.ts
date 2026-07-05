import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'notestandard_device_id';

export class DeviceManager {
    static async getDeviceId(): Promise<string> {
        try {
            let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
            if (!deviceId) {
                deviceId = Crypto.randomUUID();
                await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
            }
            return deviceId;
        } catch (err) {
            console.error('[DeviceManager] Failed to get device ID:', err);
            // Fallback to random if storage fails, though session persistence will be lost across restarts
            return Crypto.randomUUID();
        }
    }
}
