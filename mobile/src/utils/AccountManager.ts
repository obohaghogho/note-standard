import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCOUNTS_KEY = 'notestandard_accounts_v2';
const ACTIVE_ACCOUNT_KEY = 'notestandard_active_account_id';

export type TokenState = "valid" | "stale" | "invalid" | "refreshing";

export interface StoredAccount {
    id: string;
    email: string;
    username: string;
    full_name?: string;
    avatar_url?: string;
    token: string;
    refresh_token?: string;
    lastActive: number;
    tokenState?: TokenState;
    lastValidatedAt?: number;
    sessionId?: string;
    deviceId?: string;
}

export class AccountManager {
    static async getAllAccounts(): Promise<StoredAccount[]> {
        try {
            const data = await AsyncStorage.getItem(ACCOUNTS_KEY);
            const accounts: StoredAccount[] = data ? JSON.parse(data) : [];
            // Ensure backwards compatibility by defaulting tokenState to valid if token exists
            return accounts.map(a => ({
                ...a,
                tokenState: a.tokenState || (a.token ? "valid" : "invalid")
            })).sort((a, b) => b.lastActive - a.lastActive);
        } catch (err) {
            console.error('[AccountManager] Failed to get accounts:', err);
            return [];
        }
    }

    static async getAccount(userId: string): Promise<StoredAccount | undefined> {
        const accounts = await this.getAllAccounts();
        return accounts.find(a => a.id === userId);
    }

    static async saveAccount(account: Omit<StoredAccount, 'lastActive'>) {
        try {
            const accounts = await this.getAllAccounts();
            const index = accounts.findIndex(a => a.id === account.id);
            
            const newAccount: StoredAccount = {
                ...account,
                lastActive: Date.now(),
                tokenState: account.tokenState || (account.token ? "valid" : "invalid"),
                lastValidatedAt: account.lastValidatedAt || Date.now()
            };

            if (index !== -1) {
                accounts[index] = newAccount;
            } else {
                accounts.push(newAccount);
            }

            // Keep only top 5
            if (accounts.length > 5) {
                accounts.sort((a, b) => b.lastActive - a.lastActive);
                accounts.splice(5);
            }

            await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
            await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, account.id);
        } catch (err) {
            console.error('[AccountManager] Failed to save account:', err);
        }
    }

    static async removeAccount(userId: string) {
        try {
            const accounts = await this.getAllAccounts();
            const filtered = accounts.filter(a => a.id !== userId);
            await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(filtered));
            
            const activeId = await AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY);
            if (activeId === userId) {
                await AsyncStorage.removeItem(ACTIVE_ACCOUNT_KEY);
            }
        } catch (err) {
            console.error('[AccountManager] Failed to remove account:', err);
        }
    }

    static async setActiveAccountId(id: string | null) {
        if (id) {
            await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
        } else {
            await AsyncStorage.removeItem(ACTIVE_ACCOUNT_KEY);
        }
    }

    static async getActiveAccountId(): Promise<string | null> {
        return await AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY);
    }

    static async updateTokens(userId: string, token: string, refresh_token?: string, sessionId?: string) {
        const accounts = await this.getAllAccounts();
        const index = accounts.findIndex(a => a.id === userId);
        if (index !== -1) {
            accounts[index].token = token;
            if (refresh_token) accounts[index].refresh_token = refresh_token;
            if (sessionId) accounts[index].sessionId = sessionId;
            accounts[index].lastActive = Date.now();
            accounts[index].tokenState = "valid";
            accounts[index].lastValidatedAt = Date.now();
            await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
        }
    }

    static async setTokenState(userId: string, state: TokenState) {
        const accounts = await this.getAllAccounts();
        const index = accounts.findIndex(a => a.id === userId);
        if (index !== -1) {
            accounts[index].tokenState = state;
            if (state === "valid") {
                accounts[index].lastValidatedAt = Date.now();
            }
            await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
        }
    }

    static async clearTokens(userId: string) {
        const accounts = await this.getAllAccounts();
        const index = accounts.findIndex(a => a.id === userId);
        if (index !== -1) {
            accounts[index].token = "";
            // Do not clear refresh token immediately, as it might be used to retry later if it's just 'stale'.
            // Only clear access token so we know we must refresh.
            await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
        }
    }
}
