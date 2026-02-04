// API Configuration
// TODO: Update to local IP for physical device testing (e.g., 'http://192.168.1.100:3000')
// localhost won't work on physical devices - use your computer's local network IP
export const API_BASE_URL = 'http://localhost:3000';

// AsyncStorage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'oasis_access_token',
  REFRESH_TOKEN: 'oasis_refresh_token',
  USER: 'oasis_user',
} as const;
