import { getSupabase } from '../services/supabase';
import { computeDayStreaks, DayStreaks } from './dayStreaks';
import { localDate } from './routineYear';

// A user's activity streaks (the Stats tab's current/best streak): a day
// counts if they did anything in the app (user_action_days); older days also
// count from the activity log, which predates it. `zone` decides where "today"
// is — the viewer's own for Stats, the profile owner's for a public profile.
export async function loadDayStreaks(userId: string, zone: string): Promise<DayStreaks> {
  const sb = getSupabase().schema('mercia');
  const [activityRes, actionRes] = await Promise.all([
    sb.from('user_activity_log').select('activity_date').eq('user_id', userId),
    sb.from('user_action_days').select('action_date').eq('user_id', userId),
  ]);
  if (activityRes.error) throw activityRes.error;
  if (actionRes.error) throw actionRes.error;
  return computeDayStreaks(
    [...(activityRes.data ?? []).map((r: any) => r.activity_date), ...(actionRes.data ?? []).map((r: any) => r.action_date)],
    localDate(new Date(), zone),
  );
}
