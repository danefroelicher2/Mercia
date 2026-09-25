import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { User, AuthContextType } from '../types';
import * as authService from '../services/auth';
import { pingHealth } from '../services/api';
import { clearWidget } from '../services/widgetSync';

// Create context with undefined default
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider props
interface AuthProviderProps {
  children: ReactNode;
}

// AuthProvider component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectingMessage, setConnectingMessage] = useState('');

  // Tracks when the app went to background so we can calculate elapsed time on resume
  const backgroundedAt = useRef<number | null>(null);
  // Ref mirror of user so the AppState listener always sees the current value
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  // Check for existing auth on mount
  useEffect(() => {

    const initializeAuth = async () => {
      try {
        const storedTokens = await authService.getStoredTokens();
        const storedUser = await authService.getStoredUser();
        if (storedTokens && storedUser) {
          // Verify token is still valid by making a test request
          setConnectingMessage('Connecting to server...');
          try {
            // Try to refresh the token to ensure it's still valid
            await authService.refreshAccessToken(storedTokens.refreshToken);
            setUser(storedUser);
          } catch {
            // Token refresh failed, clear auth data
            await authService.logout();
            clearWidget();
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        await authService.logout();
        clearWidget();
      } finally {
        setConnectingMessage('');
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Foreground-resume handler: fires a health ping on Render so the backend is
  // warm before the user's first real request. Only runs when backgrounded > 30s
  // and the user is logged in. Does not touch token refresh — the existing axios
  // interceptor handles 401s as before, but now Render is already awake.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        backgroundedAt.current = Date.now();
      } else if (nextState === 'active' && backgroundedAt.current !== null) {
        const elapsed = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (elapsed > 30_000 && userRef.current !== null) {
          setIsReconnecting(true);
          pingHealth().finally(() => setIsReconnecting(false));
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { user: loggedInUser } = await authService.login(email, password);
      setUser(loggedInUser);
    } catch (error) {
      throw error;
    }
  }, []);

  // Register function
  const register = useCallback(async (email: string, password: string, username?: string) => {
    try {
      const { user: registeredUser } = await authService.register(email, password, username);
      setUser(registeredUser);
    } catch (error) {
      throw error;
    }
  }, []);

  // Social login function
  const socialLogin = useCallback(async (provider: 'google' | 'apple', idToken: string, nonce?: string) => {
    try {
      const { user: socialUser } = await authService.socialLogin(provider, idToken, nonce);
      setUser(socialUser);
    } catch (error) {
      throw error;
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await authService.logout();
      clearWidget();
      setUser(null);
    } catch (error) {
      throw error;
    }
  }, []);

  // Context value - ensure all booleans are explicit
  const isAuthenticated: boolean = user !== null;

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    isReconnecting,
    connectingMessage,
    login,
    register,
    socialLogin,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
