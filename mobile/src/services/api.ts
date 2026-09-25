import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

// Separate instance for auth endpoints — 120s to survive Render cold start
// plus Supabase Apple/Google token verification round-trip
export const authApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000,
});

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor - attach access token to requests
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const accessToken = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    // Lets the server date actions and closed days in the user's own time zone.
    if (config.headers) {
      config.headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Called after any successful change the server counts as an action (the same
// requests as its trackAction), e.g. so the streak widget can mark today.
const actionListeners = new Set<() => void>();
export function onAction(listener: () => void): () => void {
  actionListeners.add(listener);
  return () => actionListeners.delete(listener);
}
const ACTION_PATH = /^\/api\/(routine|gym|streaks|chat|stats)(\/|$)/;
const NOT_ACTION = /\/(daily-outlook|day-in-review)$/;

// Response interceptor - handle 401 errors and token refresh
api.interceptors.response.use(
  (response) => {
    const { method, url } = response.config;
    const path = (url ?? '').split('?')[0];
    if (method && method.toLowerCase() !== 'get' && ACTION_PATH.test(path) && !NOT_ACTION.test(path)) {
      actionListeners.forEach(l => {
        try {
          l();
        } catch {}
      });
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If error is not 401 or request already retried, reject
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Skip refresh logic for auth endpoints — no token exists yet during login/register/social auth
    const authEndpoints = ['/api/auth/login', '/api/auth/register', '/api/auth/google', '/api/auth/apple', '/api/auth/refresh'];
    if (authEndpoints.some(endpoint => originalRequest.url?.includes(endpoint))) {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        })
        .catch((err) => {
          return Promise.reject(err);
        });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      // Call refresh endpoint
      const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
        refreshToken,
      });

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data.data.tokens;

      // Store new tokens
      await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newAccessToken);
      await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);

      // Update authorization header
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }

      processQueue(null, newAccessToken);

      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as Error, null);

      // Only clear tokens when the refresh endpoint itself returns 401 — meaning
      // the refresh token is genuinely invalid or expired. Network errors (no
      // response) and 5xx responses (e.g. Render cold-start) leave the refresh
      // token intact; we just reject the original request so the user can retry.
      const refreshStatus = (refreshError as AxiosError)?.response?.status;
      if (refreshStatus === 401) {
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.ACCESS_TOKEN,
          STORAGE_KEYS.REFRESH_TOKEN,
          STORAGE_KEYS.USER,
        ]);
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// Best-effort health ping — used on foreground resume to wake Render before the
// user's first real request. Uses base axios (no auth interceptors, 10s timeout).
export const pingHealth = (): Promise<void> =>
  axios
    .get(`${API_BASE_URL}/health`, { timeout: 10000 })
    .then(() => {})
    .catch(() => {});

export default api;
