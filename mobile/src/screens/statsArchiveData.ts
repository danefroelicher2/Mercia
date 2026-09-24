// Shapes of a saved Stats Archive year and small display helpers.

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
    weekly: { average: number | null; periods: number; soFar?: number | null };
    monthly: { average: number | null; periods: number; soFar?: number | null };
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
