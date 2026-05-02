import { type Session } from '@supabase/supabase-js';
import { updateAccountTokens, getAccount, type StoredAccount } from './accountManager';

/**
 * Performs a token refresh for a specific account without using the main Supabase singleton.
 * Includes a 'Stale Retry' mechanism to handle race conditions where another tab
 * might have already rotated the token.
 * Added retry logic for transient failures (network/500s) to prevent false 'expired' reports.
 */
export const refreshSessionIsolated = async (account: StoredAccount, retryCount = 0): Promise<Session | null> => {
  const MAX_RETRIES = 3;
  const isStaleRetry = retryCount > 0 && retryCount < 100; // Special flag for the auth rotation retry

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[AuthUtils] Missing Supabase environment variables');
      throw new Error('Configuration error');
    }

    const refreshToken = account.tokens?.refresh_token || account.session?.refresh_token;
    if (!refreshToken) {
      console.warn(`[AuthUtils] Missing refresh token for account: ${account.email}`);
      return null; // Terminal: Cannot refresh without token
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: refreshToken
      })
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      const errorMsg = data.error_description || data.error || `Status ${response.status}`;
      
      // Handle Case: Invalid Grant (400) - Likely token was already rotated elsewhere
      if (response.status === 400 && !isStaleRetry) {
        console.warn(`[AuthUtils] Refresh failed (400) for ${account.email}. Checking for rotation race...`);
        
        const latestAccount = getAccount(account.id);
        const latestToken = latestAccount?.tokens?.refresh_token || latestAccount?.session?.refresh_token;
        const currentToken = account.tokens?.refresh_token || account.session?.refresh_token;

        if (latestAccount && latestToken && latestToken !== currentToken) {
          console.log(`[AuthUtils] Token was indeed rotated elsewhere. Retrying with latest...`);
          return refreshSessionIsolated(latestAccount, 100); // 100 marks a stale retry
        }
      }

      // Terminal Auth Errors
      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403 ||
        data.error === 'invalid_grant' ||
        data.error_description?.includes('Refresh Token Not Found')
      ) {
        console.warn(`[AuthUtils] Refresh token permanently revoked for ${account.email}: ${errorMsg}`);
        return null;
      }

      // Transient Errors (5xx or others)
      if (response.status >= 500 && retryCount < MAX_RETRIES) {
        console.warn(`[AuthUtils] Server error (${response.status}), retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
        return refreshSessionIsolated(account, retryCount + 1);
      }

      throw new Error(errorMsg);
    }

    console.log(`[AuthUtils] Token refreshed successfully for ${account.email}`);

    const newSession: Session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + data.expires_in),
      token_type: data.token_type,
      user: data.user
    };

    updateAccountTokens(account.id, newSession);
    return newSession;
  } catch (err) {
    // Handle Network Errors (Transient)
    const isNetworkError = !navigator.onLine || 
      err instanceof TypeError || 
      (err instanceof Error && (
        err.message.toLowerCase().includes('fetch') || 
        err.message.toLowerCase().includes('network') ||
        err.message.toLowerCase().includes('timeout')
      ));

    if (isNetworkError && retryCount < MAX_RETRIES) {
      console.warn(`[AuthUtils] Network error for ${account.email}, retrying... (${retryCount + 1}/${MAX_RETRIES})`, err);
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
      return refreshSessionIsolated(account, retryCount + 1);
    }

    console.error(`[AuthUtils] Isolated refresh failed for ${account.email}:`, err);
    
    // If we reach here, it's a real failure. 
    // We throw instead of returning null to prevent AuthContext from assuming 'expired session'.
    throw err;
  }
};
