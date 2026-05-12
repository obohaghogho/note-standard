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
  },
});

// Request Interceptor: Attach Auth Token
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await AuthService.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.error('[apiClient] Error fetching token from storage', e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle Global Errors (401, 500, etc.)
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.map(cb => cb(token));
  refreshSubscribers = [];
}

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response) {
      const status = error.response.status;
      
      // If 401 Unauthorized, attempt to refresh the token
      if (status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // If already refreshing, wait for it to complete
          return new Promise(resolve => {
            subscribeTokenRefresh(token => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;
        
        try {
          console.log('[apiClient] 401 Detected. Attempting token refresh...');
          const refreshToken = await AuthService.getRefreshToken();
          
          if (!refreshToken) {
            console.warn('[apiClient] Refresh failed: No refresh token in storage');
            throw new Error('No refresh token');
          }

          // Use axios directly to avoid interceptor recursion
          const res = await axios.post(`${API_URL}/api/auth/refresh-token`, { 
            refresh_token: refreshToken 
          }, { timeout: 20000 });

          const { token: newToken, refresh_token: newRefreshToken } = res.data;
          
          if (!newToken) throw new Error('Backend returned empty access token');

          // Save new tokens
          await AuthService.setToken(newToken);
          if (newRefreshToken) await AuthService.setRefreshToken(newRefreshToken);
          
          console.log('[apiClient] ✓ Token refreshed successfully');
          isRefreshing = false;
          onRefreshed(newToken);

          // Retry the original request
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch (refreshError: any) {
          isRefreshing = false;
          refreshSubscribers = [];
          
          console.error('[apiClient] ✗ Token refresh failed:', refreshError.message);
          
          // Only force logout if it's a real auth error, not a network failure
          const isAuthError = refreshError.response?.status === 401 || 
                             refreshError.message === 'No refresh token' ||
                             refreshError.response?.data?.error?.includes('invalid');

          if (isAuthError) {
            console.warn('[apiClient] Refresh token invalid. Logging out...');
            await AuthService.logout();
            Alert.alert('Session Expired', 'Your session has expired. Please log in again.');
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
