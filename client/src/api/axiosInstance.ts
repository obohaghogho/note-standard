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
// Uses a retry loop to handle Supabase session hydration delay after Paystack redirect
api.interceptors.request.use(
  async (config) => {
    // If the caller already set an Authorization header, honour it as-is.
    if (config.headers.Authorization) {
      return config;
    }

    // Attempt to get session using the resilient safeAuth helper
    let session = await safeAuth();

    // Direct fallback if safeAuth returned null (e.g. during initial hydration)
    if (!session?.access_token) {
      try {
        const { supabase } = await import('../lib/supabase');
        const { data } = await supabase.auth.getSession();
        session = data?.session || null;
      } catch { /* silent fallback */ }
    }

    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
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
            console.log('[Axios] Token refreshed successfully after 401. Retrying request...');
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

    // For non-retryable errors, extract message from response
    if (error.response?.data?.error) {
      return Promise.reject(new Error(error.response.data.error));
    }
    return Promise.reject(error);
  }
)

export default api

