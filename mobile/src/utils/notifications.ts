import { DeviceManager } from './DeviceManager';

// NOTE: @react-native-firebase/messaging is NOT imported here.
// All push token registration is handled exclusively by PushHandler.registerDeviceToken()
// to avoid duplicate registration paths. Do not add a second registration flow here.

export async function getDeviceId(): Promise<string> {
    return DeviceManager.getDeviceId();
}

// registerForPushNotificationsAsync() was removed in Phase 11 cleanup.
// It was dead code — never called from App.tsx, AuthContext, or any screen.
// All token registration flows through PushHandler.registerDeviceToken() in PushHandler.ts.
