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
    const config = error.config;
    
    if (error.response) {
      const status = error.response.status;
      
      console.error(`[apiClient] API Error ${status} on ${config?.url}:`, error.response.data);

      if (status === 401) {
        // Unauthorized - Token likely expired
        console.warn('[apiClient] Token expired or invalid. Logging out...');
        await AuthService.logout();
        Alert.alert('Session Expired', 'Your session has expired. Please log in again.');
      } else if (status >= 500) {
        // Server Error
        console.error('[apiClient] Server error encountered');
      }
    } else if (error.request) {
      // Network Error
      console.error(`[apiClient] Network Error on ${config?.url}:`, error.message);
    } else {
      console.error('[apiClient] Request setup error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
