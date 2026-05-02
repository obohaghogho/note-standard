import type { Profile } from '../types/auth';

const STORAGE_KEY = 'notestandard_accounts';
const ACTIVE_ACCOUNT_KEY = 'notestandard_active_account_id';

export interface MinimalSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface StoredAccount {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  tokens: MinimalSession;
  session?: MinimalSession; // Legacy support
  profile: Profile;
  lastActive: number;
}

/**
 * AccountManager handles persistent storage and retrieval of multiple user sessions.
 * Refactored to deterministic architecture: stores only minimal tokens, no full session objects.
 */
export const accountManager = {
  /**
   * Get all stored accounts from localStorage, sorted by last active
   */
  getAllAccounts(): StoredAccount[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      const accounts: StoredAccount[] = data ? JSON.parse(data) : [];
      return accounts.sort((a, b) => b.lastActive - a.lastActive);
    } catch (err) {
      console.error('[AccountManager] Failed to parse accounts:', err);
      return [];
    }
  },

  /**
   * Get a specific account by ID
   */
  getAccount(userId: string): StoredAccount | undefined {
    return this.getAllAccounts().find(a => a.id === userId);
  },

  /**
   * Set the ID of the currently active account (for rehydration on reload)
   */
  setActiveAccountId(id: string | null) {
    if (id) {
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    }
  },

  /**
   * Get the ID of the currently active account
   */
  getActiveAccountId(): string | null {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  },

  /**
   * Save or update an account in the list.
   * Deterministic logic: Extracts only the necessary tokens from the session.
   */
  saveAccount(session: { user: { id?: string; email?: string }; access_token: string; refresh_token: string; expires_at?: number }, profile: Profile) {
    const userId = session?.user?.id || profile?.id;
    if (!userId || !profile) return;

    const accounts = this.getAllAccounts();
    const index = accounts.findIndex(a => a.id === userId);

    const accountData: StoredAccount = {
      id: userId,
      email: session?.user?.email || profile.email || '',
      full_name: profile.full_name || profile.username || 'User',
      avatar_url: profile.avatar_url || null,
      tokens: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at || 0
      },
      profile,
      lastActive: Date.now()
    };

    if (index !== -1) {
      accounts[index] = accountData;
    } else {
      accounts.push(accountData);
    }

    // Limit to 5 accounts
    if (accounts.length > 5) {
      accounts.sort((a, b) => b.lastActive - a.lastActive);
      accounts.splice(5);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  },

  /**
   * Update only the tokens for an existing account
   */
  updateAccountTokens(userId: string, session: { access_token: string; refresh_token: string; expires_at?: number }) {
    const accounts = this.getAllAccounts();
    const index = accounts.findIndex(a => a.id === userId);

    if (index !== -1) {
      const existing = accounts[index];
      const existingTokens = existing.tokens || existing.session;
      // Update if tokens are different, don't rely purely on expires_at which can suffer from clock drift
      if (
        existingTokens && 
        session.access_token === existingTokens.access_token && 
        session.refresh_token === existingTokens.refresh_token
      ) {
        return false;
      }

      accounts[index].tokens = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at || 0
      };
      accounts[index].lastActive = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
      return true;
    }
    return false;
  },

  /**
   * Remove an account from the list
   */
  removeAccount(userId: string) {
    const accounts = this.getAllAccounts().filter(a => a.id !== userId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    if (this.getActiveAccountId() === userId) {
      this.setActiveAccountId(null);
    }
  },

  clearLegacyStaleMarkers() {
    localStorage.removeItem('notestandard_stale_accounts');
  },

  clearAccountStale() {
    // Legacy support: We no longer use stale markers in the new architecture.
    this.clearLegacyStaleMarkers();
  },

  isAccountSessionValid(userId: string): boolean {
    const account = this.getAccount(userId);
    const tokens = account?.tokens || account?.session;
    if (!tokens) return false;
    const expiresAt = tokens.expires_at;
    if (!expiresAt) return true;
    const now = Math.floor(Date.now() / 1000);
    return (expiresAt - now) > 120; // 2 minute buffer
  }
};

// Export direct functions for shared usage
export const getStoredAccounts = accountManager.getAllAccounts.bind(accountManager);
export const saveAccount = accountManager.saveAccount.bind(accountManager);
export const removeAccount = accountManager.removeAccount.bind(accountManager);
export const getAccount = accountManager.getAccount.bind(accountManager);
export const clearLegacyStaleMarkers = accountManager.clearLegacyStaleMarkers.bind(accountManager);
export const setActiveAccountId = accountManager.setActiveAccountId.bind(accountManager);
export const getActiveAccountId = accountManager.getActiveAccountId.bind(accountManager);
export const updateAccountTokens = accountManager.updateAccountTokens.bind(accountManager);
export const isAccountSessionValid = accountManager.isAccountSessionValid.bind(accountManager);
export const clearAccountStale = accountManager.clearAccountStale.bind(accountManager);
export const getAllAccounts = accountManager.getAllAccounts.bind(accountManager);
// Compatibility aliases
export const updateAccountSession = updateAccountTokens;
