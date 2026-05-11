import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from './EventEmitter';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';

export interface User {
    id: string;
    email: string;
    username: string;
    full_name?: string;
    avatar_url?: string;
    plan_tier?: string;
}

export class AuthService {
    static async setToken(token: string) {
        await AsyncStorage.setItem(TOKEN_KEY, token);
    }

    static async getToken() {
        return await AsyncStorage.getItem(TOKEN_KEY);
    }

    static async setRefreshToken(token: string) {
        await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
    }

    static async getRefreshToken() {
        return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    }

    static async setUser(user: User) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    static async getUser(): Promise<User | null> {
        const user = await AsyncStorage.getItem(USER_KEY);
        return user ? JSON.parse(user) : null;
    }

    static async logout() {
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
        await AsyncStorage.removeItem(USER_KEY);
        EventEmitter.emit('auth:logout', null);
    }

    static async isAuthenticated() {
        const token = await this.getToken();
        return !!token;
    }
}
