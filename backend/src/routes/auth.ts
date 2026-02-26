import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { registerUser, loginUser, refreshAccessToken, generateTokens, getSupabase, User } from '../services/auth';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

/**
 * POST /api/auth/register
 * Register new user
 */
router.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, username } = req.body;
      const result = await registerUser(email, password, username);

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          tokens: result.tokens,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/auth/login
 * Login user
 */
router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await loginUser(email, password);

      res.json({
        success: true,
        data: {
          user: result.user,
          tokens: result.tokens,
        },
      });
    } catch (error: any) {
      res.status(401).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  validate(refreshSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      const tokens = await refreshAccessToken(refreshToken);

      res.json({
        success: true,
        data: { tokens },
      });
    } catch (error: any) {
      res.status(401).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/auth/google
 * Sign in with Google ID token
 */
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({
        success: false,
        error: 'ID token is required',
      });
      return;
    }

    const supabase = getSupabase();

    // Sign in with Google using Supabase
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      res.status(401).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (!data.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication failed',
      });
      return;
    }

    // Upsert profile so returning users don't hit duplicate key errors
    const { error: profileError } = await supabase
      .schema('oasis')
      .from('user_profiles')
      .upsert(
        { id: data.user.id, username: data.user.email!.split('@')[0] },
        { onConflict: 'id' }
      );

    if (profileError) {
      console.error('Failed to upsert Google user profile:', profileError);
    }

    // Generate our own JWT tokens for consistent auth
    const user: User = {
      id: data.user.id,
      email: data.user.email!,
    };
    const tokens = generateTokens(user);

    res.json({
      success: true,
      data: {
        user,
        tokens,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/auth/apple
 * Sign in with Apple ID token
 */
router.post('/apple', async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken, nonce } = req.body;

    if (!idToken) {
      res.status(400).json({
        success: false,
        error: 'ID token is required',
      });
      return;
    }

    const supabase = getSupabase();

    // Sign in with Apple using Supabase
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
      nonce,
    });

    if (error) {
      res.status(401).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (!data.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication failed',
      });
      return;
    }

    // Upsert profile so returning users don't hit duplicate key errors
    const { error: profileError } = await supabase
      .schema('oasis')
      .from('user_profiles')
      .upsert(
        { id: data.user.id, username: data.user.email!.split('@')[0] },
        { onConflict: 'id' }
      );

    if (profileError) {
      console.error('Failed to upsert Apple user profile:', profileError);
    }

    // Generate our own JWT tokens for consistent auth
    const user: User = {
      id: data.user.id,
      email: data.user.email!,
    };
    const tokens = generateTokens(user);

    res.json({
      success: true,
      data: {
        user,
        tokens,
      },
    });
  } catch (error) {
    console.error('Apple auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Send password reset email
 */
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email is required',
      });
      return;
    }

    const supabase = getSupabase();

    // Send password reset email
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://eooenwleghhzrzgkagjp.supabase.co/auth/v1/verify',
    });

    // Always return success even if email doesn't exist (security best practice)
    if (error) {
      console.error('Password reset error:', error);
    }

    res.json({
      success: true,
      message: 'If that email exists, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password (requires authentication)
 */
router.post('/change-password', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  console.log('[Change Password] Request received from user:', req.user?.id);
  console.log('[Change Password] Request body:', {
    hasCurrentPassword: !!req.body.currentPassword,
    hasNewPassword: !!req.body.newPassword,
  });

  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      });
      return;
    }

    const supabase = getSupabase();

    // Get user's email to verify current password
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId!);

    if (userError || !userData.user) {
      res.status(401).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userData.user.email!,
      password: currentPassword,
    });

    if (signInError) {
      res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
      });
      return;
    }

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId!,
      { password: newPassword }
    );

    if (updateError) {
      res.status(500).json({
        success: false,
        error: 'Failed to update password',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/auth/account
 * Delete user account (requires authentication)
 */
router.delete('/account', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  console.log('[Delete Account] Request received from user:', req.user?.id);

  try {
    const userId = req.user?.id;

    const supabase = getSupabase();

    // Delete user from Supabase Auth (triggers cascade delete in database)
    const { error } = await supabase.auth.admin.deleteUser(userId!);

    if (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete account',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
