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
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response) {
      const status = error.response.status;
      
      console.error(`[apiClient] API Error ${status} on ${originalRequest?.url}:`, error.response.data);

      if (status === 401 && !originalRequest._retry) {
        // Unauthorized - Token likely expired
        originalRequest._retry = true;
        
        try {
          console.log('[apiClient] Attempting token refresh...');
          const refreshToken = await AuthService.getRefreshToken();
          
          if (!refreshToken) {
            console.warn('[apiClient] No refresh token available');
            throw new Error('No refresh token');
          }

          // Request a new access token from our backend
          const res = await axios.post(`${API_URL}/api/auth/refresh-token`, { 
            refresh_token: refreshToken 
          });

          const { token: newToken, refresh_token: newRefreshToken } = res.data;
          
          // Save new tokens
          await AuthService.setToken(newToken);
          if (newRefreshToken) await AuthService.setRefreshToken(newRefreshToken);
          
          console.log('[apiClient] Token refreshed successfully');

          // Retry the original request with the new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          console.error('[apiClient] Refresh failed. Logging out...', refreshError);
          await AuthService.logout();
          Alert.alert('Session Expired', 'Your session has expired. Please log in again.');
          return Promise.reject(error);
        }
      } else if (status >= 500) {
        // Server Error
        console.error('[apiClient] Server error encountered');
      }
    } else if (error.request) {
      // Network Error
      console.error(`[apiClient] Network Error on ${originalRequest?.url}:`, error.message);
    } else {
      console.error('[apiClient] Request setup error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
