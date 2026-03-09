import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // CSRF protection — forms can't set custom headers
  },
  timeout: 600000, // 10 minutes for curriculum generation
  withCredentials: true, // Send HTTP-only cookies with requests
});

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      const isAuthAttempt =
        requestUrl.includes('/auth/login') ||
        requestUrl.includes('/auth/google') ||
        requestUrl.includes('/auth/microsoft') ||
        requestUrl.includes('/auth/register');

      if (isAuthAttempt) {
        return Promise.reject(error);
      }

      // Session expired or invalid
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
