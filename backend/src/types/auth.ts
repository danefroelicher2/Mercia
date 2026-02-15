export interface SocialAuthRequest {
  idToken: string;
  nonce?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResponse {
  success: boolean;
  data?: {
    user: {
      id: string;
      email: string | null;
    };
    session: {
      access_token: string;
      refresh_token: string;
    };
  };
  error?: string;
  message?: string;
}
