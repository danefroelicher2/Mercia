import type { ProfileExtras } from '../../types/profileFeed';

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA — design preview only. DELETE THIS FILE before launch.
//
// Shows the finished look of your profile (level, posts, stats, records)
// before the real feed exists. It only ever appears in the dev app on your
// own profile: `__DEV__` is false in TestFlight/App Store builds, so users
// can never see it. Your real name and photo still come from the server;
// bio and follower counts are filled in only while yours are empty, and the
// streak numbers are sample ones so they match the sample posts.
// ─────────────────────────────────────────────────────────────────────────────

export const PROFILE_MOCK_ENABLED = __DEV__;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

// Filled in only where your real profile is still empty.
export const PROFILE_MOCK_FILL = {
  followers: 248,
  following: 131,
  bio: 'Early mornings, heavy lifts.\nBuilding one perfect day at a time.',
  currentStreak: 103,
  bestStreak: 103,
};

export const PROFILE_MOCK: ProfileExtras = {
  // Level 14 (Disciplined), 520 of 760 XP into it.
  totalXp: 6760,
  posts: [
    {
      id: 'm1', kind: 'streak', at: hoursAgo(74), xp: 150, pinned: true, props: 31,
      days: 100,
    },
    {
      id: 'm2', kind: 'workout', at: hoursAgo(2), xp: 90, props: 12, proppedByMe: false,
      title: 'Push Day', focus: 'Chest · Shoulders · Triceps', minutes: 52, sets: 18, volumeLb: 9450, prs: 2,
      exercises: [
        { name: 'Bench Press', detail: '4 × 8 · 185 lb', pr: true },
        { name: 'Incline DB Press', detail: '3 × 10 · 70 lb' },
        { name: 'Overhead Press', detail: '4 × 6 · 135 lb', pr: true },
      ],
    },
    {
      id: 'm3', kind: 'perfect_day', at: hoursAgo(15), xp: 170, props: 8,
      done: 12, planned: 12,
      parts: [
        { label: 'Morning', done: 5, planned: 5 },
        { label: 'Afternoon', done: 4, planned: 4 },
        { label: 'Night', done: 3, planned: 3 },
      ],
    },
    {
      id: 'm4', kind: 'level_up', at: hoursAgo(28), xp: 0, props: 19,
      level: 14, tier: 'Disciplined', newTier: false,
    },
    {
      id: 'm5', kind: 'pr', at: hoursAgo(50), xp: 25, props: 22,
      exercise: 'Deadlift', value: '405 lb × 3', previous: '385 lb × 3', delta: '+20 lb',
    },
    {
      id: 'm6', kind: 'goal', at: hoursAgo(98), xp: 30, props: 6,
      scope: 'weekly', title: 'Read 5 times', done: 5, target: 5,
    },
    {
      id: 'm7', kind: 'workout', at: hoursAgo(122), xp: 40, props: 9,
      title: 'Leg Day', focus: 'Quads · Hamstrings · Glutes', minutes: 64, sets: 20, volumeLb: 14820, prs: 0,
      exercises: [
        { name: 'Back Squat', detail: '5 × 5 · 275 lb' },
        { name: 'Romanian Deadlift', detail: '4 × 8 · 225 lb' },
        { name: 'Walking Lunge', detail: '3 × 12 · 50 lb' },
      ],
    },
  ],
  year: {
    consistency: 78,
    perfectDays: 41,
    gymSessions: 112,
    tasksDone: 1832,
    weeklyXp: [420, 510, 380, 620, 700, 540, 810, 760, 690, 880, 940, 720],
    bestPart: { label: 'Morning', pct: 84 },
    bestWeekday: { label: 'Tuesday', pct: 88 },
    bestMonth: { label: 'August', pct: 86 },
  },
  lifts: [
    { label: 'Bench Press', value: '225 lb × 5', sub: 'Set Sep 12', icon: 'barbell-outline' },
    { label: 'Back Squat', value: '315 lb × 3', sub: 'Set Aug 30', icon: 'barbell-outline' },
    { label: 'Deadlift', value: '405 lb × 3', sub: 'Set Sep 25', icon: 'barbell-outline' },
    { label: 'Overhead Press', value: '135 lb × 6', sub: 'Set Sep 27', icon: 'barbell-outline' },
  ],
  bests: [
    { label: 'Longest streak', value: '103 days', sub: 'Since Jun 18 · still going', icon: 'flame-outline' },
    { label: 'Best week', value: '940 XP', sub: 'Week of Sep 15', icon: 'trending-up-outline' },
    { label: 'Most in a day', value: '18 tasks', sub: 'Jul 4', icon: 'checkmark-done-outline' },
    { label: 'Heaviest session', value: '16,240 lb', sub: 'Leg Day · Aug 30', icon: 'podium-outline' },
  ],
};
