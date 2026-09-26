import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Expo from 'expo-server-sdk';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getSupabase } from '../services/supabase';
import { validZone } from '../lib/routineYear';

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
// GET / PUT /api/notifications/preferences
// The eight reminder switches (all on unless switched off). PUT also still
// accepts the three older fields the 1.x app sends.
// ============================================================
const SWITCHES = {
  morningWrapup: 'morning_wrapup_enabled',
  afternoonWrapup: 'afternoon_wrapup_enabled',
  nightCheck: 'night_check_enabled',
  streakAtRisk: 'streak_at_risk_enabled',
  lastCall: 'last_call_enabled',
  freshStart: 'fresh_start_enabled',
  weeklyGoals: 'weekly_goals_enabled',
  monthlyGoals: 'monthly_goals_enabled',
} as const;
type SwitchKey = keyof typeof SWITCHES;

router.get('/preferences', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getSupabase()
    .schema('oasis')
    .from('notification_preferences')
    .select('*')
    .eq('user_id', req.user!.id)
    .maybeSingle();
  if (error) {
    console.error('[NOTIFICATIONS] Preferences read failed:', error);
    res.status(500).json({ success: false, error: 'Failed to load preferences' });
    return;
  }
  const prefs = Object.fromEntries(
    (Object.keys(SWITCHES) as SwitchKey[]).map(k => [k, (data as any)?.[SWITCHES[k]] !== false]),
  );
  res.json({ success: true, data: prefs });
});

const prefsSchema = z.object({
  morningWrapup: z.boolean().optional(),
  afternoonWrapup: z.boolean().optional(),
  nightCheck: z.boolean().optional(),
  streakAtRisk: z.boolean().optional(),
  lastCall: z.boolean().optional(),
  freshStart: z.boolean().optional(),
  weeklyGoals: z.boolean().optional(),
  monthlyGoals: z.boolean().optional(),
  // 1.x app
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
    const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
    for (const k of Object.keys(SWITCHES) as SwitchKey[]) if (body[k] !== undefined) row[SWITCHES[k]] = body[k];
    if (body.weeklySummaryEnabled !== undefined) row.weekly_summary_enabled = body.weeklySummaryEnabled;
    if (body.inactivityReminderEnabled !== undefined) row.inactivity_reminder_enabled = body.inactivityReminderEnabled;
    if (body.streakAtRiskEnabled !== undefined && body.streakAtRisk === undefined) row.streak_at_risk_enabled = body.streakAtRiskEnabled;

    const { error } = await getSupabase()
      .schema('oasis')
      .from('notification_preferences')
      .upsert(row, { onConflict: 'user_id' });

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

  // The app also sends its time zone and Morning/Afternoon/Night boundaries
  // so days (and years) close at the user's own midnight.
  const update: Record<string, unknown> = { last_active_at: new Date().toISOString() };
  const { timezone, afternoonStart, nightStart } = req.body ?? {};
  if (typeof timezone === 'string' && validZone(timezone) === timezone) update.timezone = timezone;
  if (Number.isInteger(afternoonStart) && afternoonStart >= 0 && afternoonStart < 1440) update.afternoon_start = afternoonStart;
  if (Number.isInteger(nightStart) && nightStart >= 0 && nightStart < 1440) update.night_start = nightStart;

  const { error } = await supabase
    .schema('oasis')
    .from('user_profiles')
    .update(update)
    .eq('id', userId);

  if (error) {
    console.error('[NOTIFICATIONS] Ping update failed for user', userId, ':', error);
    // Still return 200 — ping is best-effort, not blocking
  }

  res.json({ success: true });
});

export default router;
