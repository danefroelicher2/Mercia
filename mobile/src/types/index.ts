// TypeScript types for Oasis AI mobile app

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
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<void>;
  logout: () => Promise<void>;
}
