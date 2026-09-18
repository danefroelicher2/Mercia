import Constants from 'expo-constants';

export const IS_EXPO_GO = Constants.appOwnership === 'expo';

// API Configuration
// TODO: Update to local IP for physical device testing (e.g., 'http://192.168.1.100:3000')
// localhost won't work on physical devices - use your computer's local network IP
const PRODUCTION_API_URL = 'https://oasis-backend-k739.onrender.com';

// Dev builds can point at a local backend with EXPO_PUBLIC_API_URL
// (e.g. `EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --dev-client`).
// Release builds always use production.
export const API_BASE_URL =
  __DEV__ && process.env.EXPO_PUBLIC_API_URL ? process.env.EXPO_PUBLIC_API_URL : PRODUCTION_API_URL;

// AsyncStorage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'mercia_access_token',
  REFRESH_TOKEN: 'mercia_refresh_token',
  USER: 'mercia_user',
} as const;
