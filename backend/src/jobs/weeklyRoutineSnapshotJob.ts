import { getSupabase } from '../services/supabase';

// ============================================
// WEEKLY ROUTINE SNAPSHOT JOB
// Runs every Monday at 5 AM UTC.
// 1. Snapshots last week's (Mon–Sun) Today item completion stats
//    into weekly_routine_stats.
// 2. If this Monday crossed into a new calendar month, compounds
//    all that month's weekly rows into monthly_routine_stats and
//    deletes the individual weekly rows.
// ============================================

export async function runWeeklyRoutineSnapshot(): Promise<void> {
  const supabase = getSupabase();

  // This runs on Monday — last week = the Mon–Sun that just ended.
  const todayStr = new Date().toISOString().split('T')[0]; // This Monday (UTC)
  const lastWeekMonStr = offsetDate(todayStr, -7);          // Last Monday
  const lastWeekSunStr = offsetDate(todayStr, -1);          // Last Sunday

  console.log(`\n[WEEKLY-SNAPSHOT] ============================`);
  console.log(`[WEEKLY-SNAPSHOT] Snapshotting week ${lastWeekMonStr} – ${lastWeekSunStr}`);

  const { data: userRows, error: usersError } = await supabase
    .schema('oasis')
    .from('routine_tasks')
    .select('user_id');

  if (usersError) {
    console.error('[WEEKLY-SNAPSHOT] Failed to fetch users:', usersError);
    return;
  }

  const userIds = [...new Set((userRows || []).map((r: any) => r.user_id as string))];
  console.log(`[WEEKLY-SNAPSHOT] Processing ${userIds.length} users`);

  for (const userId of userIds) {
    try {
      await processUser(userId, lastWeekMonStr, lastWeekSunStr, todayStr, supabase);
    } catch (err) {
      console.error(`[WEEKLY-SNAPSHOT] Error for user ${userId}:`, err);
    }
  }

  console.log('[WEEKLY-SNAPSHOT] Done\n');
}

async function processUser(
  userId: string,
  weekStart: string,
  weekEnd: string,
  thisMonday: string,
  supabase: ReturnType<typeof getSupabase>
): Promise<void> {
  // ── 1. Calculate last week's stats ───────────────────────────
  const [{ data: allTasks }, { data: completions }] = await Promise.all([
    supabase
      .schema('oasis')
      .from('routine_tasks')
      .select('id, day_of_week')
      .eq('user_id', userId)
      .eq('type', 'non-negotiable'),
    supabase
      .schema('oasis')
      .from('task_completion_history')
      .select('task_id, snapshot_date')
      .eq('user_id', userId)
      .gte('snapshot_date', weekStart)
      .lte('snapshot_date', weekEnd)
      .eq('completed', true),
  ]);

  const completedSet = new Set(
    (completions || []).map((c: any) => `${c.task_id}::${c.snapshot_date}`)
  );

  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let totalPossible = 0;
  let totalCompleted = 0;

  for (const dateStr of datesInRange(weekStart, weekEnd)) {
    const d = new Date(dateStr + 'T12:00:00Z');
    const dowName = DAY_NAMES[d.getUTCDay()];
    const tasksForDay = (allTasks || []).filter((t: any) => t.day_of_week === dowName);
    totalPossible += tasksForDay.length;
    for (const task of tasksForDay as any[]) {
      if (completedSet.has(`${task.id}::${dateStr}`)) totalCompleted++;
    }
  }

  const percentage = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

  // ── 2. Store weekly snapshot ──────────────────────────────────
  const { error: upsertErr } = await supabase
    .schema('oasis')
    .from('weekly_routine_stats')
    .upsert(
      { user_id: userId, week_start: weekStart, week_end: weekEnd, total_possible: totalPossible, total_completed: totalCompleted, percentage },
      { onConflict: 'user_id,week_start' }
    );

  if (upsertErr) {
    console.error(`[WEEKLY-SNAPSHOT] Weekly upsert failed for ${userId}:`, upsertErr);
    return;
  }

  // ── 3. Month boundary check ───────────────────────────────────
  const lastMon = new Date(weekStart + 'T12:00:00Z');
  const thisMon = new Date(thisMonday + 'T12:00:00Z');
  const crossedMonth =
    lastMon.getUTCMonth() !== thisMon.getUTCMonth() ||
    lastMon.getUTCFullYear() !== thisMon.getUTCFullYear();

  if (crossedMonth) {
    await compoundMonth(userId, lastMon.getUTCFullYear(), lastMon.getUTCMonth() + 1, supabase);
  }
}

async function compoundMonth(
  userId: string,
  year: number,
  month: number, // 1–12
  supabase: ReturnType<typeof getSupabase>
): Promise<void> {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data: weekRows, error } = await supabase
    .schema('oasis')
    .from('weekly_routine_stats')
    .select('id, total_possible, total_completed')
    .eq('user_id', userId)
    .gte('week_start', monthStart)
    .lte('week_start', monthEnd);

  if (error || !weekRows || weekRows.length === 0) return;

  const totalPossible = (weekRows as any[]).reduce((s, w) => s + w.total_possible, 0);
  const totalCompleted = (weekRows as any[]).reduce((s, w) => s + w.total_completed, 0);
  const percentage = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

  await supabase
    .schema('oasis')
    .from('monthly_routine_stats')
    .upsert(
      { user_id: userId, year, month, total_possible: totalPossible, total_completed: totalCompleted, percentage },
      { onConflict: 'user_id,year,month' }
    );

  await supabase
    .schema('oasis')
    .from('weekly_routine_stats')
    .delete()
    .eq('user_id', userId)
    .in('id', (weekRows as any[]).map((w: any) => w.id));

  console.log(`[WEEKLY-SNAPSHOT] Compounded ${weekRows.length} week(s) → ${year}-${String(month).padStart(2, '0')} for user ${userId}`);
}

// ── Helpers ──────────────────────────────────────────────────────

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function datesInRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const end = new Date(endStr + 'T12:00:00Z');
  const cur = new Date(startStr + 'T12:00:00Z');
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}
