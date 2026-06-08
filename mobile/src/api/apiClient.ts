import axios from 'axios';
import { API_URL } from '../Config';
import { AuthService } from '../services/AuthService';
import { Alert } from 'react-native';

const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000, // 15 seconds
  headers: {
    'Content-Type': 'application/json',
    'x-client-type': 'mobile', // Used to bypass reCAPTCHA
    'X-Client-Info': 'mobile', // Legacy header for some controllers
  },
});
console.log('API_URL is configured to:', API_URL);

// Request Interceptor: Attach Auth Token
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await AuthService.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      const user = await AuthService.getUser();
      if (user) {
        const { AccountManager } = require('../utils/AccountManager');
        const account = await AccountManager.getAccount(user.id);
        if (account?.sessionId) config.headers['X-Session-ID'] = account.sessionId;
        if (account?.deviceId) config.headers['X-Device-ID'] = account.deviceId;
      }
    } catch (e) {
      console.error('[apiClient] Error fetching token from storage', e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle Global Errors (401, 500, etc.)
const isRefreshing: Record<string, boolean> = {};
const refreshSubscribers: Record<string, ((token: string | null) => void)[]> = {};

function onRefreshed(sessionId: string, token: string) {
  if (refreshSubscribers[sessionId]) {
    refreshSubscribers[sessionId].forEach(cb => cb(token));
    delete refreshSubscribers[sessionId];
  }
}

function onRefreshFailed(sessionId: string) {
  if (refreshSubscribers[sessionId]) {
    refreshSubscribers[sessionId].forEach(cb => cb(null));
    delete refreshSubscribers[sessionId];
  }
}

function subscribeTokenRefresh(sessionId: string, cb: (token: string | null) => void) {
  if (!refreshSubscribers[sessionId]) refreshSubscribers[sessionId] = [];
  refreshSubscribers[sessionId].push(cb);
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response) {
      const status = error.response.status;
      
      // If 401 Unauthorized, attempt to refresh the token
      if (status === 401 && !originalRequest._retry) {
        const { AccountManager } = require('../utils/AccountManager');
        const currentUser = await AuthService.getUser();
        const account = currentUser ? await AccountManager.getAccount(currentUser.id) : null;
        const sessionId = account?.sessionId || 'unknown';

        if (isRefreshing[sessionId]) {
          // Queue the request until token refresh completes
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh(sessionId, newToken => {
              if (!newToken) {
                reject(error);
                return;
              }
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(apiClient(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing[sessionId] = true;
        
        try {
          console.log(`[apiClient] 401 Detected. Attempting token refresh for session: ${sessionId}`);
          const refreshToken = await AuthService.getRefreshToken();
          
          if (!refreshToken) {
            console.warn('[apiClient] Refresh failed: No refresh token in storage');
            throw new Error('No refresh token');
          }

          // Use axios directly to avoid interceptor recursion
          // Added x-client-type to ensure bypass of web-only checks on server
          const res = await axios.post(`${API_URL}/api/auth/refresh-token`, { 
            refresh_token: refreshToken,
            session_id: sessionId,
            device_id: account?.deviceId
          }, { 
            timeout: 30000,
            headers: {
              'Content-Type': 'application/json',
              'x-client-type': 'mobile',
              'X-Client-Info': 'mobile'
            }
          });

          const { token: newToken, refresh_token: newRefreshToken } = res.data;
          
          if (!newToken) throw new Error('Backend returned empty access token');

          // Save new tokens
          await AuthService.setToken(newToken);
          if (newRefreshToken) await AuthService.setRefreshToken(newRefreshToken);
          if (currentUser) {
            await AccountManager.updateTokens(currentUser.id, newToken, newRefreshToken, sessionId);
            await AccountManager.setTokenState(currentUser.id, "valid");
          }
          
          console.log('[apiClient] ✓ Token refreshed successfully');
          isRefreshing[sessionId] = false;
          onRefreshed(sessionId, newToken);

          // Retry the original request
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch (refreshError: any) {
          isRefreshing[sessionId] = false;
          onRefreshFailed(sessionId);
          
          console.error('[apiClient] ✗ Token refresh failed:', refreshError.message);
          
          const isNetworkError = !refreshError.response;
          const isAuthError = !isNetworkError && (
            refreshError.response?.status === 401 ||
            refreshError.message === 'No refresh token' ||
            refreshError.response?.data?.error?.includes('invalid') ||
            refreshError.response?.data?.error?.includes('expired')
          );

          if (isAuthError) {
            console.warn('[apiClient] Refresh token invalid. Expiring session...');
            if (currentUser) {
                await AuthService.expireSession(currentUser.id, true);
                Alert.alert('Session Expired', 'Your session has expired. Please log in again.');
            } else {
                await AuthService.logout(); // Fallback
            }
          }
          
          return Promise.reject(error);
        }
      }
    }
    
    // Generic error logging (useful for debugging)
    if (error.response) {
        console.error(`[apiClient] API Error ${error.response.status} on ${originalRequest?.url}`);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
