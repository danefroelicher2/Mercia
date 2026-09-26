import { getSupabase } from '../services/supabase';
import { sendPush } from '../services/pushNotifications';
import { addDays, validZone, weekdayOf } from '../lib/routineYear';
import { computeDayStreaks } from '../lib/dayStreaks';
import { KINDS, Kind, Reminder, UserState, decide, localNow } from '../lib/notificationRules';

// Every 15 minutes (pg_cron → POST /api/cron/notifications): for each user
// with a push token, gather their day and send the one reminder that's due,
// if any. The rules live in lib/notificationRules; this only collects state
// and sends. Each send first claims its (user, kind, local day) row in
// notification_log, so overlapping or repeated runs can never double-send.

export const PREF_COLUMNS: Record<Kind, string> = {
  morning_wrapup: 'morning_wrapup_enabled',
  afternoon_wrapup: 'afternoon_wrapup_enabled',
  night_check: 'night_check_enabled',
  streak_at_risk: 'streak_at_risk_enabled',
  last_call: 'last_call_enabled',
  fresh_start: 'fresh_start_enabled',
  weekly_goals: 'weekly_goals_enabled',
  monthly_goals: 'monthly_goals_enabled',
};

export interface RunResult {
  userId: string;
  localTime: string;
  reminder: Reminder | null;
  sent: boolean;
  note?: string;
}

async function stateFor(userId: string, now: Date): Promise<{ state: UserState; local: ReturnType<typeof localNow> } | null> {
  const sb = getSupabase().schema('oasis');
  const { data: profile, error } = await sb
    .from('user_profiles')
    .select('timezone, afternoon_start, night_start, last_active_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  const tz = validZone(profile.timezone);
  const local = localNow(now, tz);
  const today = local.date;
  const yesterday = addDays(today, -1);

  const [prefsRes, tasksRes, doneRes, actionRes, activityRes, goalsRes, logRes] = await Promise.all([
    sb.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('routine_tasks').select('id, text, time_of_day, created_at, sort_order').eq('user_id', userId).eq('type', 'today').eq('day_of_week', weekdayOf(today)).order('sort_order', { ascending: true }),
    sb.from('task_completion_history').select('task_id').eq('user_id', userId).eq('snapshot_date', today).eq('completed', true),
    sb.from('user_action_days').select('action_date').eq('user_id', userId).gte('action_date', addDays(today, -400)),
    sb.from('user_activity_log').select('activity_date').eq('user_id', userId).gte('activity_date', addDays(today, -400)),
    sb.from('routine_goals').select('type, completed').eq('user_id', userId).in('type', ['weekly', 'monthly']),
    sb.from('notification_log').select('kind').eq('user_id', userId).eq('local_date', today),
  ]);
  for (const r of [prefsRes, tasksRes, doneRes, actionRes, activityRes, goalsRes, logRes]) if (r.error) throw r.error;

  // Everything on unless the user switched it off.
  const prefs = Object.fromEntries(KINDS.map(k => [k, prefsRes.data?.[PREF_COLUMNS[k]] !== false])) as Record<Kind, boolean>;

  // Today's items not crossed off, per part of the day (items count from the day they were added).
  const done = new Set((doneRes.data ?? []).map((r: any) => r.task_id));
  const left: UserState['left'] = { morning: [], afternoon: [], night: [] };
  for (const t of tasksRes.data ?? []) {
    const added = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t.created_at));
    if (added > today || done.has(t.id)) continue;
    const part = (['morning', 'afternoon', 'night'] as const).includes(t.time_of_day) ? (t.time_of_day as keyof UserState['left']) : 'morning';
    left[part].push(t.text);
  }

  // Streak: any action keeps it (same rule as the widget and Stats).
  const days = [...(actionRes.data ?? []).map((r: any) => r.action_date), ...(activityRes.data ?? []).map((r: any) => r.activity_date)];
  const s = computeDayStreaks(days, today);
  const asOfYesterday = computeDayStreaks(days, yesterday);
  const endedLastNight = asOfYesterday.activeToday ? 0 : asOfYesterday.currentStreak;

  const goals = goalsRes.data ?? [];
  const leftOf = (type: string) => goals.filter((g: any) => g.type === type && !g.completed).length;

  return {
    local,
    state: {
      afternoonStart: profile.afternoon_start ?? 720,
      nightStart: profile.night_start ?? 1080,
      prefs,
      left,
      streak: s.currentStreak,
      activeToday: s.activeToday,
      endedLastNight,
      weeklyGoalsLeft: leftOf('weekly'),
      monthlyGoalsLeft: leftOf('monthly'),
      sentToday: (logRes.data ?? []).map((r: any) => r.kind as Kind),
      minutesSinceActive: profile.last_active_at ? (now.getTime() - Date.parse(profile.last_active_at)) / 60000 : null,
    },
  };
}

export async function runNotifications(opts: { dryRun?: boolean; now?: Date } = {}): Promise<RunResult[]> {
  const sb = getSupabase().schema('oasis');
  const now = opts.now ?? new Date();
  const { data: tokens, error } = await sb.from('push_tokens').select('user_id');
  if (error) throw error;
  const userIds = Array.from(new Set((tokens ?? []).map((t: any) => t.user_id as string)));

  const results: RunResult[] = [];
  for (const userId of userIds) {
    try {
      const got = await stateFor(userId, now);
      if (!got) continue;
      const reminder = decide(got.state, got.local);
      const localTime = `${got.local.date} ${String(Math.floor(got.local.minutes / 60)).padStart(2, '0')}:${String(got.local.minutes % 60).padStart(2, '0')}`;
      if (!reminder || opts.dryRun) {
        results.push({ userId, localTime, reminder, sent: false });
        continue;
      }
      // Claim the slot first; a duplicate key means another run already sent it.
      const { error: claimErr } = await sb
        .from('notification_log')
        .insert({ user_id: userId, kind: reminder.kind, local_date: got.local.date, body: reminder.body });
      if (claimErr) {
        results.push({ userId, localTime, reminder, sent: false, note: claimErr.code === '23505' ? 'already sent' : claimErr.message });
        continue;
      }
      await sendPush(userId, '', reminder.body, { screen: reminder.screen, kind: reminder.kind });
      results.push({ userId, localTime, reminder, sent: true });
    } catch (err: any) {
      console.error('[NOTIFY] user', userId, 'failed:', err);
      results.push({ userId, localTime: '', reminder: null, sent: false, note: err?.message ?? String(err) });
    }
  }
  const sent = results.filter(r => r.sent).length;
  if (sent || opts.dryRun) console.log(`[NOTIFY] ${opts.dryRun ? 'dry run' : 'sent'}: ${sent}/${results.length}`);
  return results;
}
