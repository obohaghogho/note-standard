import * as SecureStore from 'expo-secure-store';
import { fromByteArray, toByteArray } from 'base64-js';

export const storage = {
    async save(key: string, value: string) {
        await SecureStore.setItemAsync(key, value);
    },

    async get(key: string) {
        return await SecureStore.getItemAsync(key);
    },

    async delete(key: string) {
        await SecureStore.deleteItemAsync(key);
    },

    // For E2EE keys specifically
    async savePrivateKey(key: Uint8Array) {
        const base64 = fromByteArray(key);
        await SecureStore.setItemAsync('e2ee_private_key', base64);
    },

    async getPrivateKey(): Promise<Uint8Array | null> {
        const base64 = await SecureStore.getItemAsync('e2ee_private_key');
        if (!base64) return null;
        return toByteArray(base64);
    }
};
