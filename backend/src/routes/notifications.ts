import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Expo from 'expo-server-sdk';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getSupabase } from '../services/supabase';

const router = Router();
router.use(authenticateToken);

// ============================================================
// POST /api/notifications/register
// Upserts the caller's Expo push token.
// ============================================================
const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']).optional(),
});

router.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { token, platform } = req.body as z.infer<typeof registerSchema>;

    if (!Expo.isExpoPushToken(token)) {
      res.status(400).json({ success: false, error: 'Invalid Expo push token' });
      return;
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .schema('oasis')
      .from('push_tokens')
      .upsert(
        { user_id: userId, token, platform: platform ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' }
      );

    if (error) {
      console.error('[NOTIFICATIONS] Token upsert failed:', error);
      res.status(500).json({ success: false, error: 'Failed to register token' });
      return;
    }

    res.json({ success: true });
  }
);

// ============================================================
// PUT /api/notifications/preferences
// Upserts the caller's notification preferences.
// ============================================================
const prefsSchema = z.object({
  weeklySummaryEnabled: z.boolean().optional(),
  inactivityReminderEnabled: z.boolean().optional(),
  streakAtRiskEnabled: z.boolean().optional(),
});

router.put(
  '/preferences',
  validate(prefsSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const body = req.body as z.infer<typeof prefsSchema>;

    const supabase = getSupabase();
    const { error } = await supabase
      .schema('oasis')
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          ...(body.weeklySummaryEnabled     !== undefined && { weekly_summary_enabled:       body.weeklySummaryEnabled }),
          ...(body.inactivityReminderEnabled !== undefined && { inactivity_reminder_enabled: body.inactivityReminderEnabled }),
          ...(body.streakAtRiskEnabled      !== undefined && { streak_at_risk_enabled:       body.streakAtRiskEnabled }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[NOTIFICATIONS] Preferences upsert failed:', error);
      res.status(500).json({ success: false, error: 'Failed to save preferences' });
      return;
    }

    res.json({ success: true });
  }
);

// ============================================================
// POST /api/notifications/ping
// Updates last_active_at on user_profiles (called on app open).
// ============================================================
router.post('/ping', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const supabase = getSupabase();

  const { error } = await supabase
    .schema('oasis')
    .from('user_profiles')
    .update({ last_active_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    console.error('[NOTIFICATIONS] Ping update failed for user', userId, ':', error);
    // Still return 200 — ping is best-effort, not blocking
  }

  res.json({ success: true });
});

export default router;
