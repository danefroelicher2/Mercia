// TypeScript types for Mercia mobile app

// Re-export question types
export * from './question';

// Re-export chat types
export * from './chat';

// Re-export navigation types
export * from './navigation';

// Re-export memory types
export * from './memory';

export interface User {
  id: string;
  email: string;
  username?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  success: boolean;
  data: {
    user: User;
    tokens: AuthTokens;
  };
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    code?: string;
  };
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<void>;
  socialLogin: (provider: 'google' | 'apple', idToken: string, nonce?: string) => Promise<void>;
  logout: () => Promise<void>;
}
