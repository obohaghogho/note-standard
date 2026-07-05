import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

// NOTE: @react-native-firebase/messaging is NOT imported here.
// All push token registration is handled exclusively by PushHandler.registerDeviceToken()
// to avoid duplicate registration paths. Do not add a second registration flow here.

const DEVICE_ID_KEY = '@app_device_id';

export async function getDeviceId() {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = uuidv4();
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

// registerForPushNotificationsAsync() was removed in Phase 11 cleanup.
// It was dead code — never called from App.tsx, AuthContext, or any screen.
// All token registration flows through PushHandler.registerDeviceToken() in PushHandler.ts.
