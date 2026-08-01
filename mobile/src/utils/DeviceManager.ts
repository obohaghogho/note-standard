import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = '@app_device_id';

export class DeviceManager {
    static async getDeviceId(): Promise<string> {
        try {
            let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
            if (!deviceId) {
                // Check legacy keys for seamless migration
                const legacy1 = await AsyncStorage.getItem('notestandard_device_id');
                const legacy2 = await AsyncStorage.getItem('chat_device_id');
                deviceId = legacy1 || legacy2 || Crypto.randomUUID();
                await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
            }
            return deviceId;
        } catch (err) {
            console.error('[DeviceManager] Failed to get device ID:', err);
            return Crypto.randomUUID();
        }
    }
}
