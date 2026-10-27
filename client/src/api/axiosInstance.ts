import axios from "axios"
import { safeAuth } from "../lib/supabaseSafe"
import { API_URL } from "../lib/api"

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 45000, // 45s timeout for complete payment & withdrawal processing
  headers: {
    "Content-Type": "application/json",
  },
})

// Add a request interceptor to include the auth token
// Uses a resilient lookup with local storage fallback to prevent unauthenticated 1st upload attempts
api.interceptors.request.use(
  async (config) => {
    // If sending FormData, delete default application/json Content-Type header
    // so Axios/browser automatically injects 'multipart/form-data; boundary=...'
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers) {
        delete config.headers['Content-Type'];
        delete (config.headers as any)['content-type'];
      }
    }

    // If the caller already set an Authorization header, honour it as-is.
    if (config.headers.Authorization) {
      return config;
    }

    // Attempt to get session using the resilient safeAuth helper (reads tab-scoped Supabase session)
    let session = await safeAuth();

    // Direct fallback: Query Supabase Auth directly if safeAuth returned null
    if (!session?.access_token) {
      try {
        const { supabase } = await import('../lib/supabase');
        const { data } = await supabase.auth.getSession();
        session = data?.session || null;
      } catch { /* silent fallback */ }
    }

    // Tab-scoped active account validation and account-registry restoration
    try {
      const { accountManager } = await import('../utils/accountManager');
      const activeId = accountManager.getActiveAccountId();

      if (session?.access_token && session.user?.id && activeId) {
        // If the session user ID does not match the tab's verified active account,
        // do NOT send a request with a mismatched foreign token! Fail closed or restore from account registry.
        if (session.user.id.trim().toLowerCase() !== activeId.trim().toLowerCase()) {
          console.warn(`[Axios] Session mismatch: session user ${session.user.id} !== active account ${activeId}. Attempting verified restoration...`);
          const verifiedAccount = accountManager.getAccount(activeId);
          if (verifiedAccount?.tokens?.access_token) {
            session = { access_token: verifiedAccount.tokens.access_token, user: { id: activeId } } as any;
          } else {
            // Mismatched and cannot verify active account token -> fail closed
            session = null;
          }
        }
      } else if (!session?.access_token && activeId) {
        // Tab session missing: check tab-scoped sessionStorage token or restore verified account token
        if (typeof window !== 'undefined' && window.sessionStorage) {
          const tabToken = window.sessionStorage.getItem('token');
          const verifiedAccount = accountManager.getAccount(activeId);
          if (tabToken && verifiedAccount?.tokens?.access_token === tabToken) {
            session = { access_token: tabToken, user: { id: activeId } } as any;
          } else if (verifiedAccount?.tokens?.access_token) {
            session = { access_token: verifiedAccount.tokens.access_token, user: { id: activeId } } as any;
          }
        }
      }
    } catch { /* proceed */ }

    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
      // Bind this request to its verified owner ID for 401 retry identity validation.
      // Captured once at dispatch; never overwritten during retry.
      if (!(config as any).__requestOwnerId) {
        const ownerId = (session as any)?.user?.id || null;
        if (ownerId) (config as any).__requestOwnerId = ownerId;
      }
    } else {
      console.warn(`[Axios] Sending request to ${config.url} without Authorization header. (Session missing)`);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error)
  }
)


// Add a response interceptor to apply financial quarantine and auto-retry on 503
import FinancialSanitizer from "../utils/FinancialSanitizer";

api.interceptors.response.use(
  (response) => {
    // Quarantine Layer: Sanitize all incoming data before it hits the store/components
    if (response.data) {
      response.data = FinancialSanitizer.quarantine(response.data);
    }
    return response;
  },
  async (error) => {
    const config = error.config;
    if (!config) return Promise.reject(error);

    const isNetworkError = !error.response || error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED';
    const isServerError = error.response?.status === 502 || error.response?.status === 503 || error.response?.status === 504;

    // Automatically retry Network Errors (server starting up / port 5000 binding) or 502/503/504
    // Gives a ~20-second grace window to cover the 9.8-second node server boot & DB connectivity checks.
    if ((isNetworkError || isServerError) && (!config.__retryCount || config.__retryCount < 6)) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      const delays = [1200, 2000, 3000, 4000, 5000, 5000];
      const delay = delays[config.__retryCount - 1] || 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return api(config);
    }

    // 401: Session invalid or expired — attempt token refresh first before declaring session lost
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined' && (sessionStorage.getItem('notestandard_fincra_demo_session') === 'true' || localStorage.getItem('notestandard_fincra_demo_session') === 'true')) {
        console.warn('[Axios] 401 received for synthetic fincra_demo session — bypassing login redirect.');
        return Promise.reject(error);
      }

      if (!window.location.pathname.includes('/login') && !config.__is401Retry) {
        config.__is401Retry = true;
        try {
          const { supabase } = await import('../lib/supabase');
          const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
          if (!refreshErr && refreshData?.session?.access_token) {
            // Identity validation: the refreshed session must belong to the original
            // request's owner AND the tab's current active account must still be that
            // same owner. Prevents stale requests from being replayed under a switched identity.
            const requestOwnerId = (config as any).__requestOwnerId as string | undefined;
            const refreshedUserId: string | undefined = refreshData.session.user?.id;
            let currentActiveId: string | null = null;
            try {
              const { accountManager: am } = await import('../utils/accountManager');
              currentActiveId = am.getActiveAccountId();
            } catch { /* non-fatal */ }

            const ownerMatch = requestOwnerId
              // Original request was identity-bound: all three must agree
              ? (refreshedUserId === requestOwnerId && currentActiveId === requestOwnerId)
              // Original request had no captured owner (pre-existing unbound request):
              // still require refreshed user and current active account to agree
              : (!!refreshedUserId && !!currentActiveId && refreshedUserId === currentActiveId);

            if (!ownerMatch) {
              console.warn(
                `[Axios] 401 refresh rejected — identity mismatch. ` +
                `requestOwner=${requestOwnerId ?? 'unbound'}, ` +
                `refreshedUser=${refreshedUserId ?? 'none'}, ` +
                `activeAccount=${currentActiveId ?? 'none'}. ` +
                `Rejecting retry to prevent cross-account request replay.`
              );
              return Promise.reject(error);
            }

            console.log('[Axios] Token refreshed successfully after 401. Identity validated. Retrying request...');
            config.headers.Authorization = `Bearer ${refreshData.session.access_token}`;
            return api(config);
          }
        } catch { /* proceed to logout */ }

        console.warn('[Axios] 401 received and token refresh failed — clearing session and redirecting to login.');
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('supabase') || key === 'token')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        window.location.href = '/login?reason=session_expired';
      }
    }

    // For non-retryable errors, extract message from response while preserving response metadata
    if (error.response?.data?.error) {
      const customErr = new Error(error.response.data.error);
      (customErr as any).response = error.response;
      return Promise.reject(customErr);
    }
    return Promise.reject(error);
  }
)

export default api

