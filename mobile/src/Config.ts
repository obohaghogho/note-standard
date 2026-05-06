import { Platform } from 'react-native';

// In development, use your machine's IP address or 10.0.2.2 for Android emulator
export const API_URL = Platform.select({
    ios: 'http://localhost:5001',
    android: 'http://10.0.2.2:5001',
    default: 'https://note-standard-api.onrender.com'
});
