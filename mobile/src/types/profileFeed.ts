// Profile posts are made automatically from what you do in Mercia (like a
// Strava run posting itself when you finish). You can pin up to three to
// the top of your profile or hide any of them.

export type PostKind = 'workout' | 'perfect_day' | 'pr' | 'streak' | 'level_up' | 'goal';

interface PostBase {
  id: string;
  kind: PostKind;
  at: string; // ISO time it happened
  xp: number; // XP it earned
  pinned?: boolean;
  props: number; // "props" (Strava kudos) from other people
  proppedByMe?: boolean;
}

export interface WorkoutPost extends PostBase {
  kind: 'workout';
  title: string; // "Push Day"
  focus: string; // "Chest · Shoulders · Triceps"
  minutes: number;
  sets: number;
  volumeLb: number;
  prs: number;
  exercises: { name: string; detail: string; pr?: boolean }[];
}

export interface PerfectDayPost extends PostBase {
  kind: 'perfect_day';
  done: number;
  planned: number;
  parts: { label: 'Morning' | 'Afternoon' | 'Night'; done: number; planned: number }[];
}

export interface PrPost extends PostBase {
  kind: 'pr';
  exercise: string;
  value: string; // "405 lb × 3"
  previous: string; // "385 lb × 3"
  delta: string; // "+20 lb"
}

export interface StreakPost extends PostBase {
  kind: 'streak';
  days: number;
}

export interface LevelUpPost extends PostBase {
  kind: 'level_up';
  level: number;
  tier: string;
  newTier: boolean;
}

export interface GoalPost extends PostBase {
  kind: 'goal';
  scope: 'weekly' | 'yearly';
  title: string;
  done: number;
  target: number;
}

export type ProfilePost = WorkoutPost | PerfectDayPost | PrPost | StreakPost | LevelUpPost | GoalPost;

// Whoop-style numbers for the Stats tab (this year unless noted).
export interface ProfileYearStats {
  consistency: number; // % of planned tasks crossed off
  perfectDays: number;
  gymSessions: number;
  tasksDone: number;
  weeklyXp: number[]; // last 12 weeks, oldest first
  bestPart: { label: string; pct: number };
  bestWeekday: { label: string; pct: number };
  bestMonth: { label: string; pct: number };
}

export interface ProfileRecord {
  label: string;
  value: string;
  sub: string;
  icon: string;
}

export interface ProfileExtras {
  totalXp: number;
  posts: ProfilePost[];
  year: ProfileYearStats;
  lifts: ProfileRecord[];
  bests: ProfileRecord[];
}
