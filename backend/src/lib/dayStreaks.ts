import { addDays } from './routineYear';

// Day streaks: consecutive active days (YYYY-MM-DD, the user's own days).
// A streak is still alive today if yesterday was active — it only breaks once
// a whole day passes with no activity. Days after `today` are ignored.

export interface DayStreaks {
  currentStreak: number;
  currentStartedAt: string | null;
  activeToday: boolean;
  lastActive: string | null; // newest active day up to today
  recentActive: string[]; // active days in the last 14 (today − 13 … today), sorted
  longest: { length: number; startedAt: string | null; endedAt: string | null; isCurrent: boolean };
}

export function computeDayStreaks(activeDays: Iterable<string>, today: string): DayStreaks {
  const days = Array.from(new Set(activeDays)).filter(d => d <= today).sort();
  const active = new Set(days);
  const activeToday = active.has(today);
  const anchor = activeToday ? today : addDays(today, -1);

  let currentStreak = 0;
  let currentStartedAt: string | null = null;
  for (let d = anchor; active.has(d); d = addDays(d, -1)) {
    currentStreak++;
    currentStartedAt = d;
  }

  // Longest run ever (ties go to the most recent).
  let longest = { length: 0, startedAt: null as string | null, endedAt: null as string | null };
  let runStart = '';
  for (let i = 0; i < days.length; i++) {
    if (i === 0 || days[i] !== addDays(days[i - 1], 1)) runStart = days[i];
    const length = Math.round((Date.parse(days[i]) - Date.parse(runStart)) / 86400_000) + 1;
    if (length >= longest.length) longest = { length, startedAt: runStart, endedAt: days[i] };
  }

  const from = addDays(today, -13);
  return {
    currentStreak,
    currentStartedAt,
    activeToday,
    lastActive: days.length ? days[days.length - 1] : null,
    recentActive: days.filter(d => d >= from),
    longest: { ...longest, isCurrent: currentStreak > 0 && longest.endedAt === anchor },
  };
}
