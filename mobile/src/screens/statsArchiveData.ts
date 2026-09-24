// Shapes of a saved Stats Archive year, plus a sample year used in
// development builds so the archive can be seen before a real year ends.

export interface Bucket {
  planned: number;
  done: number;
  points: number;
  rate: number | null;
  days?: number;
}

export interface ArchivedYearData {
  from: string | null;
  to: string | null;
  days: number;
  bySection: Record<string, Bucket>;
  byWeekday: Record<string, Bucket>;
  perfectDays: number;
  missedDays: number;
  actionDays: number;
  countedDays: number;
  consistency: number | null;
  goals: {
    weekly: { average: number | null; periods: number };
    monthly: { average: number | null; periods: number };
    yearly: { rate: number | null; completed: number; total: number };
  };
  // Saved from 2026 on; older saves may not have them.
  overall?: {
    actions: number;
    mostActiveMonth: { month: string; activeDays: number } | null; // month = YYYY-MM
  };
  gym?: {
    sessions: number;
    restDays: number;
    favoriteDay: { day: string; sessions: number } | null;
    split: { group: string; sessions: number; last?: string }[];
  };
  streaks?: {
    longest: { name: string; days: number; running?: boolean } | null;
    leastConsistent: { name: string; restarts: number } | null;
  };
  final?: boolean;
}

export interface ArchivedYear {
  year: number;
  data: ArchivedYearData;
  sample?: boolean;
}

// One quiet color per feature, used for the dot beside its group name.
export const GROUP_COLORS: Record<string, string> = {
  Routine: '#5DCAA5',
  Gym: '#E8A13A',
  Streaks: '#8E9BFF',
  Overall: '#E4E4E4',
};

export const SECTIONS = ['morning', 'afternoon', 'night'] as const;
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export const pct = (r: number | null | undefined) => (r == null ? '—' : `${Math.round(r * 100)}%`);
export const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (ym: string) => MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? ym;
export const num = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');


const bucket = (planned: number, done: number, points: number, days: number): Bucket => ({
  planned, done, points, days, rate: planned > 0 ? (done + points) / planned : null,
});

export const SAMPLE_YEAR: ArchivedYear = {
  year: 2025,
  sample: true,
  data: {
    from: '2025-01-01',
    to: '2025-12-31',
    days: 365,
    bySection: {
      morning: bucket(2920, 2310, 78, 365),
      afternoon: bucket(1095, 942, 45, 365),
      night: bucket(1460, 980, 30, 365),
    },
    byWeekday: {
      monday: bucket(782, 690, 24, 52),
      tuesday: bucket(782, 702, 30, 52),
      wednesday: bucket(797, 668, 21, 53),
      thursday: bucket(782, 641, 22, 52),
      friday: bucket(782, 598, 25, 52),
      saturday: bucket(775, 472, 16, 52),
      sunday: bucket(775, 461, 15, 52),
    },
    perfectDays: 96,
    missedDays: 11,
    actionDays: 354,
    countedDays: 365,
    consistency: 354 / 365,
    goals: {
      weekly: { average: 0.72, periods: 52 },
      monthly: { average: 0.64, periods: 12 },
      yearly: { rate: 0.5, completed: 2, total: 4 },
    },
    overall: {
      actions: 2418,
      mostActiveMonth: { month: '2025-09', activeDays: 30 },
    },
    gym: {
      sessions: 168,
      restDays: 61,
      favoriteDay: { day: 'monday', sessions: 34 },
      split: [
        { group: 'Chest', sessions: 42 },
        { group: 'Back', sessions: 40 },
        { group: 'Legs', sessions: 36 },
        { group: 'Shoulders', sessions: 26 },
        { group: 'Arms', sessions: 24 },
      ],
    },
    streaks: {
      longest: { name: 'No sugar', days: 64.3 },
      leastConsistent: { name: 'No phone in bed', restarts: 7 },
    },
    final: true,
  },
};
