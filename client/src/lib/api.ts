import { supabase } from './supabase';
import { resolveLocalUrl } from './networkUtils';

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


export const getAuthHeader = async (): Promise<Record<string, string>> => {
    try {
        let token: string | null | undefined = null;

        // 1. Check Supabase session
        try {
            const { data } = await supabase.auth.getSession();
            token = data.session?.access_token;
        } catch { /* proceed to fallbacks */ }

        // 2. Fallback to localStorage 'token' or Supabase keys
        if (!token && typeof window !== 'undefined' && window.localStorage) {
            token = localStorage.getItem('token');
            if (!token) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token'))) {
                        try {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                const found = parsed?.access_token || parsed?.currentSession?.access_token;
                                if (found) {
                                    token = found;
                                    break;
                                }
                            }
                        } catch { /* ignore parse error */ }
                    }
                }
            }
        }

        if (token) {
            return {
                'Authorization': `Bearer ${token}`
            };
        }
        return {};
    } catch (err) {
        console.error('[API] Failed to get session:', err);
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }
};

