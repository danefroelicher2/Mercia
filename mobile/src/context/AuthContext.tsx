import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, AuthContextType } from '../types';
import * as authService from '../services/auth';

// Create context with undefined default
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider props
interface AuthProviderProps {
  children: ReactNode;
}

// AuthProvider component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check for existing auth on mount
  useEffect(() => {

    const initializeAuth = async () => {
console.log('initializeAuth starrted');

      try {
        const storedTokens = await authService.getStoredTokens();
        const storedUser = await authService.getStoredUser();
console.log('tokens:', storedTokens, 'user:'. storedUser);
        if (storedTokens && storedUser) {
          // Verify token is still valid by making a test request
console.log('refreshing token');
          try {
            // Try to refresh the token to ensure it's still valid
            await authService.refreshAccessToken(storedTokens.refreshToken);
            setUser(storedUser);
          } catch {
            // Token refresh failed, clear auth data
            await authService.logout();
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        await authService.logout();
      } finally {
console.log('finally reached')
        setIsLoading(false);
console.log('isloading set to false')
      }
    };

    initializeAuth();
  }, []);

const login = useCallback(async (email: string, password: string) => {
  console.log('[AuthContext] login called');
  setIsLoading(true);
  try {
    console.log('[AuthContext] calling authService.login');
    const { user: loggedInUser } = await authService.login(email, password);
    console.log('[AuthContext] authService.login returned:', loggedInUser);
    setUser(loggedInUser);
  } catch(error) {
    console.log('[AuthContext] login error:', error);
    throw error;
  } finally {
    setIsLoading(false);
  }
}, []);

  // Register function
  const register = useCallback(async (email: string, password: string, username?: string) => {
    setIsLoading(true);
    try {
      const { user: registeredUser } = await authService.register(email, password, username);
      setUser(registeredUser);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Social login function
  const socialLogin = useCallback(async (provider: 'google' | 'apple', idToken: string, nonce?: string) => {
    setIsLoading(true);
    try {
      const { user: socialUser } = await authService.socialLogin(provider, idToken, nonce);
      setUser(socialUser);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Context value - ensure all booleans are explicit
  const isAuthenticated: boolean = user !== null;

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
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
