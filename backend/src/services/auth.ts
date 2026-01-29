import { createClient } from '@supabase/supabase-js';
import jwt, { SignOptions } from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface User {
  id: string;
  email: string;
  username?: string;
}

/**
 * Register new user
 */
export async function registerUser(
  email: string,
  password: string,
  username?: string
): Promise<{ user: User; tokens: AuthTokens }> {
  // Validate input
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    throw new Error(`Registration failed: ${authError.message}`);
  }

  if (!authData.user) {
    throw new Error('User creation failed');
  }

  // Create user profile
  const { error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      id: authData.user.id,
      username: username || email.split('@')[0],
    });

  if (profileError) {
    console.error('Failed to create user profile:', profileError);
  }

  const user: User = {
    id: authData.user.id,
    email: authData.user.email!,
    username,
  };

  const tokens = generateTokens(user);

  return { user, tokens };
}

/**
 * Login user
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: User; tokens: AuthTokens }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Login failed: ${error.message}`);
  }

  if (!data.user) {
    throw new Error('Invalid credentials');
  }

  const user: User = {
    id: data.user.id,
    email: data.user.email!,
  };

  const tokens = generateTokens(user);

  return { user, tokens };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<AuthTokens> {
  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_SECRET!
    ) as jwt.JwtPayload;

    const user: User = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
    };

    return generateTokens(user);
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}

/**
 * Verify access token
 */
export function verifyToken(token: string): User {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    return {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
    };
  } catch (error) {
    throw new Error('Invalid token');
  }
}

/**
 * Generate JWT tokens
 */
function generateTokens(user: User): AuthTokens {
  const payload = {
    id: user.id,
    email: user.email,
    username: user.username,
  };

  const accessTokenOptions: SignOptions = {
    expiresIn: '7d',
  };

  const refreshTokenOptions: SignOptions = {
    expiresIn: '30d',
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, accessTokenOptions);
  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET!, refreshTokenOptions);

  return {
    accessToken,
    refreshToken,
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  };
}
