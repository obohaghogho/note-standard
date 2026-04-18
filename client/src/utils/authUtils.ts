import { type Session } from '@supabase/supabase-js';
import { updateAccountTokens, getAccount, type StoredAccount } from './accountManager';

/**
 * Performs a token refresh for a specific account without using the main Supabase singleton.
 * Includes a 'Stale Retry' mechanism to handle race conditions where another tab
 * might have already rotated the token.
 */
export const refreshSessionIsolated = async (account: StoredAccount, isRetry = false): Promise<Session | null> => {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[AuthUtils] Missing Supabase environment variables');
      return null;
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: account.tokens.refresh_token
      })
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      // Handle Case: Invalid Grant (400) - Likely token was already rotated elsewhere
      if (response.status === 400 && !isRetry) {
        console.warn(`[AuthUtils] Refresh failed (400) for ${account.email}. Checking for rotation race...`);
        
        // Reload from storage to see if we have a NEW token now
        const latestAccount = getAccount(account.id);
        if (latestAccount && latestAccount.tokens.refresh_token !== account.tokens.refresh_token) {
          console.log(`[AuthUtils] Token was indeed rotated elsewhere. Retrying with latest...`);
          return refreshSessionIsolated(latestAccount, true);
        }
      }

      if (
        response.status === 400 ||
        data.error === 'invalid_grant' ||
        data.error_description?.includes('Refresh Token Not Found')
      ) {
        console.warn(`[AuthUtils] Refresh token permanently revoked for ${account.email}.`);
        return null;
      }
      throw new Error(data.error_description || data.error || `Status ${response.status}`);
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
    console.error(`[AuthUtils] Isolated refresh failed for ${account.email}:`, err);
    return null;
  }
};
