import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from './EventEmitter';
import { AccountManager, StoredAccount } from '../utils/AccountManager';

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
        // Also update in multi-account store if we have an active user
        const user = await this.getUser();
        if (user) {
            await AccountManager.updateTokens(user.id, token);
        }
    }

    static async getToken() {
        return await AsyncStorage.getItem(TOKEN_KEY);
    }

    static async setRefreshToken(token: string) {
        await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
        // Also update in multi-account store
        const user = await this.getUser();
        if (user) {
            const currentToken = await this.getToken();
            if (currentToken) {
                await AccountManager.updateTokens(user.id, currentToken, token);
            }
        }
    }

    static async getRefreshToken() {
        return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    }

    static async setUser(user: User) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
        // Save to multi-account store
        const token = await this.getToken();
        const refresh_token = await this.getRefreshToken();
        if (token) {
            await AccountManager.saveAccount({
                id: user.id,
                email: user.email,
                username: user.username,
                full_name: user.full_name,
                avatar_url: user.avatar_url,
                token,
                refresh_token: refresh_token || undefined
            });
        }
    }

    static async getUser(): Promise<User | null> {
        const user = await AsyncStorage.getItem(USER_KEY);
        return user ? JSON.parse(user) : null;
    }

    static async logout() {
        const user = await this.getUser();
        if (user) {
            await AccountManager.removeAccount(user.id);
        }
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
        await AsyncStorage.removeItem(USER_KEY);
        EventEmitter.emit('auth:logout', null);
    }

    static async isAuthenticated() {
        const token = await this.getToken();
        return !!token;
    }

    /**
     * Switches the active session to another stored account
     */
    static async switchAccount(userId: string): Promise<boolean> {
        const account = await AccountManager.getAccount(userId);
        if (!account) return false;

        const userData: User = {
            id: account.id,
            email: account.email,
            username: account.username,
            full_name: account.full_name,
            avatar_url: account.avatar_url,
        };

        await AsyncStorage.setItem(TOKEN_KEY, account.token);
        if (account.refresh_token) {
            await AsyncStorage.setItem(REFRESH_TOKEN_KEY, account.refresh_token);
        } else {
            await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
        }
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
        await AccountManager.setActiveAccountId(userId);
        
        EventEmitter.emit('auth:switch', userData);
        return true;
    }

    static async getStoredAccounts(): Promise<StoredAccount[]> {
        return await AccountManager.getAllAccounts();
    }
}
