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

    static async setUser(user: User, sessionId?: string, deviceId?: string) {
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
                refresh_token: refresh_token || undefined,
                sessionId,
                deviceId
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
            const account = await AccountManager.getAccount(user.id);
            if (account && account.sessionId) {
                // Background backend logout
                const { API_URL } = require('../Config');
                const axios = require('axios').default;
                axios.post(`${API_URL}/api/auth/logout`, { session_id: account.sessionId }).catch((e: any) => console.warn('Backend logout failed', e.message));
            }
            await AccountManager.removeAccount(user.id);
        }
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
        await AsyncStorage.removeItem(USER_KEY);
        EventEmitter.emit('auth:logout', null);
    }

    /**
     * Clears tokens and marks session as stale/invalid, but KEEPS the account.
     */
    static async expireSession(userId: string, isPermanent: boolean = false) {
        await AccountManager.setTokenState(userId, isPermanent ? "invalid" : "stale");
        await AccountManager.clearTokens(userId);
        
        const currentUser = await this.getUser();
        if (currentUser && currentUser.id === userId) {
            await AsyncStorage.removeItem(TOKEN_KEY);
            await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
            await AsyncStorage.removeItem(USER_KEY);
            EventEmitter.emit('auth:logout', null);
        }
    }

    static async isAuthenticated() {
        const token = await this.getToken();
        return !!token;
    }

    /**
     * Refreshes the active session if possible. Used on app startup (Layer 2).
     */
    static async hydrateActiveSession() {
        const user = await this.getUser();
        if (!user) return;

        const account = await AccountManager.getAccount(user.id);
        if (!account || !account.refresh_token) return;

        try {
            await AccountManager.setTokenState(user.id, "refreshing");
            
            // Avoid circular dependencies, just fetch directly
            const { API_URL } = require('../Config');
            const axios = require('axios').default;
            const res = await axios.post(`${API_URL}/api/auth/refresh-token`, { 
                refresh_token: account.refresh_token,
                session_id: account.sessionId,
                device_id: account.deviceId
            }, { 
                timeout: 10000,
                headers: {
                  'Content-Type': 'application/json',
                  'x-client-type': 'mobile',
                  'X-Client-Info': 'mobile'
                }
            });

            const { token, refresh_token } = res.data;
            if (token) {
                await this.setToken(token);
                if (refresh_token) await this.setRefreshToken(refresh_token);
                await AccountManager.setTokenState(user.id, "valid");
            }
        } catch (e: any) {
            console.warn('[AuthService] hydrateActiveSession failed:', e.message);
            const isPermanent = e.response?.status === 401 || e.response?.data?.error?.includes('invalid') || e.response?.data?.error?.includes('expired');
            await this.expireSession(user.id, isPermanent);
        }
    }

    /**
     * Layer 3: Background Validation
     * Slowly validate inactive accounts that are marked as "valid".
     */
    static async validateInactiveSessionsInBackground() {
        // Implement a basic validation logic here, optionally hitting API or checking expiration times.
        // To be called lazily and not block the UI.
        const accounts = await AccountManager.getAllAccounts();
        const activeUserId = await AccountManager.getActiveAccountId();
        
        for (const account of accounts) {
            if (account.id === activeUserId) continue; // Active is handled by active hydration
            if (account.tokenState !== "valid") continue;

            const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
            if (account.lastValidatedAt && (Date.now() - account.lastValidatedAt) > SEVEN_DAYS_MS) {
                // If it's been over 7 days since last validation, mark as stale to force a refresh next switch
                await AccountManager.setTokenState(account.id, "stale");
            }
        }
    }

    /**
     * Switches the active session to another stored account with Lazy Hydration
     */
    static async switchAccount(userId: string): Promise<boolean> {
        const account = await AccountManager.getAccount(userId);
        if (!account) return false;

        let isExpired = false;
        try {
            // Parse JWT safely to check expiration (mobile environment safe)
            const parts = account.token.split('.');
            if (parts.length === 3) {
                // React Native polyfill-safe base64 decode (Expo provides atob)
                // Need to pad the base64 string
                let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                while (base64.length % 4) { base64 += '='; }
                const payloadStr = atob(base64);
                const payload = JSON.parse(payloadStr);
                // Check if expired (or expiring within 60 seconds)
                if (payload.exp && payload.exp * 1000 < (Date.now() + 60000)) {
                    isExpired = true;
                }
            }
        } catch (e) {
            console.warn('[AuthService] Token parse failed, assuming expired', e);
            isExpired = true;
        }

        // Lazy Hydration
        if ((account.tokenState !== "valid" || isExpired) && account.refresh_token) {
            try {
                await AccountManager.setTokenState(userId, "refreshing");
                
                const { API_URL } = require('../Config');
                const axios = require('axios').default;
                const res = await axios.post(`${API_URL}/api/auth/refresh-token`, { 
                    refresh_token: account.refresh_token,
                    session_id: account.sessionId,
                    device_id: account.deviceId
                }, { 
                    timeout: 15000,
                    headers: { 'Content-Type': 'application/json', 'x-client-type': 'mobile' }
                });

                if (res.data.token) {
                    account.token = res.data.token;
                    if (res.data.refresh_token) {
                        account.refresh_token = res.data.refresh_token;
                    }
                    await AccountManager.updateTokens(userId, account.token, account.refresh_token, account.sessionId);
                }
            } catch (e: any) {
                console.warn('[AuthService] switchAccount refresh failed:', e.message);
                const isPermanent = e.response?.status === 401 || e.response?.data?.error?.includes('invalid');
                await AccountManager.setTokenState(userId, isPermanent ? "invalid" : "stale");
                await AccountManager.clearTokens(userId);
                return false; // Force user to login
            }
        } else if (account.tokenState === "invalid") {
            return false; // Needs re-login
        }

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
