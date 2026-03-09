import axios from "axios"
import { supabase } from "../lib/supabaseSafe"
import { API_URL } from "../lib/api"

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
})

// Add a request interceptor to include the auth token
api.interceptors.request.use(
  async (config) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Add a response interceptor to auto-retry on 503 (transient auth/service failures)
api.interceptors.response.use(
  (response) => response,
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

    // For non-retryable errors, extract message from response
    if (error.response?.data?.error) {
      return Promise.reject(new Error(error.response.data.error));
    }
    return Promise.reject(error);
  }
)

export default api

