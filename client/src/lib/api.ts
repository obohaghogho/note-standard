import { supabase } from './supabase';
import { resolveLocalUrl } from './networkUtils';
import { accountManager } from '../utils/accountManager';

const defaultApiUrl = import.meta.env.DEV ? 'http://localhost:5000' : 'https://api.notestandard.com';
const rawApiUrl = import.meta.env.VITE_API_URL || defaultApiUrl;
export const API_URL = resolveLocalUrl(rawApiUrl, defaultApiUrl);

if (!API_URL) {
  if (import.meta.env.PROD) {
    console.error('❌ CRITICAL: VITE_API_URL is not defined in production environment!');
  } else {
    console.warn('⚠️  VITE_API_URL is not defined. Using relative paths (Proxy required).');
  }
}

// Re-export the single authoritative getTabAuthToken resolver
export { getTabAuthToken } from '../utils/accountManager';

export const getAuthToken = async (): Promise<string | null> => {
    try {
        let token: string | null = null;
        let sessionUserId: string | null = null;

        // 1. Check tab-scoped Supabase session
        try {
            const { data } = await supabase.auth.getSession();
            token = data.session?.access_token || null;
            sessionUserId = data.session?.user?.id || null;
        } catch { /* proceed to account registry verification */ }

        // 2. Validate against tab-scoped active account
        const activeId = accountManager.getActiveAccountId();
        if (!activeId) {
            // Fail closed: No verified active account in this tab. Never return unverified token.
            return null;
        }

        const acc = accountManager.getAccount(activeId);
        if (!acc) {
            return null;
        }

        if (token && sessionUserId) {
            if (sessionUserId.trim().toLowerCase() !== activeId.trim().toLowerCase()) {
                console.warn(`[API] Session user ${sessionUserId} mismatch with active account ${activeId}. Restoring active account token.`);
                return acc.tokens?.access_token || null;
            }
            return token;
        }

        if (!token) {
            // Check tab-scoped sessionStorage token if verified to match active account
            if (typeof window !== 'undefined' && window.sessionStorage) {
                const tabToken = window.sessionStorage.getItem('token');
                if (tabToken && acc.tokens?.access_token === tabToken) {
                    return tabToken;
                }
            }
            if (acc.tokens?.access_token) {
                return acc.tokens.access_token;
            }
        }

        // Token present but sessionUserId missing: verify against account token
        if (token && acc.tokens?.access_token === token) {
            return token;
        }

        // Fail closed: Never return an untagged generic or unverified token
        return null;
    } catch {
        return null;
    }
};

export const getAuthHeader = async (): Promise<Record<string, string>> => {
    const token = await getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};
