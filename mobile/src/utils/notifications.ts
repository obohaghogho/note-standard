import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import messaging from '@react-native-firebase/messaging';

const DEVICE_ID_KEY = '@app_device_id';

export async function getDeviceId() {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = uuidv4();
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#6366f1',
        });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
    }

    try {
        token = (await Notifications.getExpoPushTokenAsync()).data;
    } catch (e) {
        console.log('Failed to get Expo push token:', e);
    }
    
    let nativeToken = null;
    let type = null;
    try {
        if (Platform.OS === 'ios') {
            const devicePushToken = await Notifications.getDevicePushTokenAsync();
            nativeToken = devicePushToken.data;
            type = 'apns';
        } else if (Platform.OS === 'android') {
            await messaging().registerDeviceForRemoteMessages();
            nativeToken = await messaging().getToken();
            type = 'fcm';
        }
    } catch (e) {
        console.log('Native push token error:', e);
    }

    const deviceId = await getDeviceId();

    return { token, nativeToken, type, deviceId };
}

