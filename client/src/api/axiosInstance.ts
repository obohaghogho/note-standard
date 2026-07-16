import axios from "axios"
import { safeAuth } from "../lib/supabaseSafe"
import { API_URL } from "../lib/api"

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000, // 15s global timeout
  headers: {
    "Content-Type": "application/json",
  },
})

// Add a request interceptor to include the auth token
// Uses a retry loop to handle Supabase session hydration delay after Paystack redirect
api.interceptors.request.use(
  async (config) => {
    // If the caller already set an Authorization header (e.g. ChatContext session init
    // passing the token directly to bypass safeAuth throttling), honour it as-is.
    if (config.headers.Authorization) {
      return config;
    }

    // Attempt to get session using the resilient safeAuth helper
    const session = await safeAuth();

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

    // Only retry on 503 (service temporarily unavailable)
    if (error.response?.status === 503 && (!config.__retryCount || config.__retryCount < 2)) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      const delay = config.__retryCount * 1500; // 1.5s, 3s
      await new Promise(resolve => setTimeout(resolve, delay));
      return api(config);
    }

    // 401: Session invalid or expired (e.g. after API key rotation)
    // Clear all stale Supabase tokens and redirect to login.
    if (error.response?.status === 401) {
      // Avoid redirect loops if we're already on the login page
      if (!window.location.pathname.includes('/login')) {
        console.warn('[Axios] 401 received — clearing stale session and redirecting to login.');
        // Clear all Supabase-related keys from localStorage
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('supabase') || key === 'token')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        // Small delay so any in-flight toasts can show before redirect
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

