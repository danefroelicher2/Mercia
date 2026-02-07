import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { STORAGE_KEYS } from '../constants/config';
import { AuthTokens, User, AuthResponse } from '../types';

// Register a new user
export const register = async (
  email: string,
  password: string,
  username?: string
): Promise<{ user: User; tokens: AuthTokens }> => {
  const response = await api.post<AuthResponse>('/api/auth/register', {
    email,
    password,
    ...(username && { username }),
  });

  const { user, tokens } = response.data.data;
  await storeTokens(tokens);
  await storeUser(user);

  return { user, tokens };
};

// Login an existing userr
export const login = async (
  email: string,
  password: string
): Promise<{ user: User; tokens: AuthTokens }> => {
  const response = await api.post<AuthResponse>('/api/auth/login', {
    email,
    password,
  });

  const { user, tokens } = response.data.data;
  await storeTokens(tokens);
  await storeUser(user);

  return { user, tokens };
};

// Logout - clear all stored auth data
export const logout = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.USER,
  ]);
};

// Get stored tokens from AsyncStorage
export const getStoredTokens = async (): Promise<AuthTokens | null> => {
  const [accessToken, refreshToken] = await AsyncStorage.multiGet([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
  ]);

  if (accessToken[1] && refreshToken[1]) {
    return {
      accessToken: accessToken[1],
      refreshToken: refreshToken[1],
      expiresIn: 0, // We don't store expiresIn locally
    };
  }

  return null;
};

// Store tokens in AsyncStorage
export const storeTokens = async (tokens: AuthTokens): Promise<void> => {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken],
    [STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken],
  ]);
};

// Get stored user from AsyncStorage
export const getStoredUser = async (): Promise<User | null> => {
  const userJson = await AsyncStorage.getItem(STORAGE_KEYS.USER);
  if (userJson) {
    return JSON.parse(userJson);
  }
  return null;
};

// Store user in AsyncStorage
export const storeUser = async (user: User): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};

// Refresh access token
export const refreshAccessToken = async (
  refreshToken: string
): Promise<AuthTokens> => {
  const response = await api.post<AuthResponse>('/api/auth/refresh', {
    refreshToken,
  });

  const { tokens } = response.data.data;
  await storeTokens(tokens);

  return tokens;
};
