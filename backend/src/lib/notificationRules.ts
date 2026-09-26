// Which reminder (if any) a user should get right now. Pure: the job gathers
// the user's state, this decides. All times are the user's local time, and
// follow their own Afternoon/Night starts.
//
//  #  kind              fires at                         only if
//  1  morning_wrapup    1h before Afternoon starts       morning items left today
//  2  afternoon_wrapup  1h before Night starts           afternoon items left today
//  3  night_check       2h after Night starts            night items left today
//  4  streak_at_risk    when Night starts                streak ≥ 1, nothing done today
//  5  last_call         11 PM                            streak ≥ 3, nothing done today
//  6  fresh_start       9 AM                             a 2+ day streak ended last night
//  7  weekly_goals      Sunday, when Afternoon starts    weekly goals left
//  8  monthly_goals     3 days before month end, same    monthly goals left
//
// Everywhere: at most 3 a day, nothing midnight–7 AM, nothing while the user
// was just in the app (last 15 min), each at most once per day, and never
// when there's nothing to act on. A reminder stays due for an hour after its
// time, so a missed 15-minute run still sends it.

export const KINDS = [
  'morning_wrapup',
  'afternoon_wrapup',
  'night_check',
  'streak_at_risk',
  'last_call',
  'fresh_start',
  'weekly_goals',
  'monthly_goals',
] as const;
export type Kind = (typeof KINDS)[number];

// When two are due at once, the more urgent goes first.
const PRIORITY: Kind[] = ['last_call', 'streak_at_risk', 'night_check', 'afternoon_wrapup', 'morning_wrapup', 'weekly_goals', 'monthly_goals', 'fresh_start'];

export const DAILY_CAP = 3;
export const QUIET_UNTIL = 7 * 60;
export const WINDOW_MINUTES = 60;
export const RECENT_USE_MINUTES = 15;

export interface UserState {
  afternoonStart: number; // minutes after midnight
  nightStart: number;
  prefs: Record<Kind, boolean>;
  // Names of today's items not crossed off yet, per part of the day (empty
  // when nothing is planned or everything is done).
  left: { morning: string[]; afternoon: string[]; night: string[] };
  streak: number; // current streak (through yesterday if nothing done today yet)
  activeToday: boolean;
  endedLastNight: number; // length of a streak that broke at midnight, else 0
  weeklyGoalsLeft: number;
  monthlyGoalsLeft: number;
  sentToday: Kind[];
  minutesSinceActive: number | null; // null = never / unknown
}

export interface LocalNow {
  date: string; // YYYY-MM-DD
  minutes: number; // minutes after midnight
  weekday: number; // 0 = Sunday … 6 = Saturday
  daysInMonth: number;
  monthName: string; // "September"
}

export interface Reminder {
  kind: Kind;
  body: string;
  screen: 'routine' | 'home';
}

const LATEST = 23 * 60 + 45; // everything fires before midnight

/** Minute of the day this reminder fires today, or null if it doesn't fire today. */
export function fireMinute(kind: Kind, s: Pick<UserState, 'afternoonStart' | 'nightStart'>, now: LocalNow): number | null {
  const a = s.afternoonStart;
  const n = s.nightStart;
  const day = Number(now.date.slice(8, 10));
  switch (kind) {
    case 'morning_wrapup': return a - 60;
    case 'afternoon_wrapup': return n - 60;
    case 'night_check': return Math.min(n + 120, LATEST);
    case 'streak_at_risk': return n;
    case 'last_call': return Math.min(Math.max(23 * 60, n + 30), LATEST);
    case 'fresh_start': return 9 * 60;
    case 'weekly_goals': return now.weekday === 0 ? a : null;
    case 'monthly_goals': return day === now.daysInMonth - 3 ? a : null;
  }
}

function listNames(names: string[]): string {
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${shown}, +${names.length - 2}` : shown;
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The reminder if it applies right now (ignoring timing, cap and prefs), else null. */
export function build(kind: Kind, s: UserState, now: LocalNow): Reminder | null {
  switch (kind) {
    case 'morning_wrapup': {
      const l = s.left.morning;
      return l.length ? { kind, screen: 'routine', body: `${plural(l.length, 'morning item')} left: ${listNames(l)}. Afternoon starts in an hour.` } : null;
    }
    case 'afternoon_wrapup': {
      const l = s.left.afternoon;
      return l.length ? { kind, screen: 'routine', body: `${plural(l.length, 'afternoon item')} left: ${listNames(l)}. Night starts in an hour.` } : null;
    }
    case 'night_check': {
      const l = s.left.night;
      return l.length ? { kind, screen: 'routine', body: `Night routine: ${plural(l.length, 'item')} to go: ${listNames(l)}.` } : null;
    }
    case 'streak_at_risk':
      return s.streak >= 1 && !s.activeToday
        ? { kind, screen: 'home', body: `Your ${s.streak}-day streak ends at midnight. Do anything in Mercia to keep it.` }
        : null;
    case 'last_call':
      return s.streak >= 3 && !s.activeToday
        ? { kind, screen: 'home', body: `Last call: about an hour left to save your ${s.streak}-day streak.` }
        : null;
    case 'fresh_start':
      return s.endedLastNight >= 2 && !s.activeToday
        ? { kind, screen: 'home', body: `Your ${s.endedLastNight}-day streak ended yesterday. Today is day 1 again.` }
        : null;
    case 'weekly_goals':
      return s.weeklyGoalsLeft > 0
        ? { kind, screen: 'routine', body: `${plural(s.weeklyGoalsLeft, 'weekly goal')} left before the week resets.` }
        : null;
    case 'monthly_goals':
      return s.monthlyGoalsLeft > 0
        ? { kind, screen: 'routine', body: `3 days left in ${now.monthName}: ${plural(s.monthlyGoalsLeft, 'monthly goal')} to go.` }
        : null;
  }
}

/** The one reminder to send this run, or null. */
export function decide(s: UserState, now: LocalNow): Reminder | null {
  if (now.minutes < QUIET_UNTIL) return null;
  if (s.sentToday.length >= DAILY_CAP) return null;
  if (s.minutesSinceActive !== null && s.minutesSinceActive < RECENT_USE_MINUTES) return null;
  for (const kind of PRIORITY) {
    if (!s.prefs[kind] || s.sentToday.includes(kind)) continue;
    const at = fireMinute(kind, s, now);
    if (at === null || now.minutes < at || now.minutes >= at + WINDOW_MINUTES) continue;
    const r = build(kind, s, now);
    if (r) return r;
  }
  return null;
}

/** Local date/time parts for an instant in a time zone. */
export function localNow(at: Date, tz: string): LocalNow {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => p.find(x => x.type === t)?.value ?? '';
  const y = Number(get('year'));
  const m = Number(get('month'));
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate(),
    monthName: names[m - 1],
  };
}
