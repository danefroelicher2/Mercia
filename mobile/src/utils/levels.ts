// Levels: everything you do in Mercia earns XP, and XP fills levels. Each
// level takes a little more XP than the last; every few levels you reach a
// new tier with its own name and color.

export interface Tier {
  name: string;
  from: number; // first level of the tier
  color: string;
}

export const TIERS: Tier[] = [
  { name: 'Starter', from: 1, color: '#9AA4AE' },
  { name: 'Building', from: 5, color: '#5DCAA5' },
  { name: 'Disciplined', from: 10, color: '#4FA3F7' },
  { name: 'Relentless', from: 20, color: '#A77BF3' },
  { name: 'Elite', from: 35, color: '#F2B544' },
  { name: 'Legend', from: 50, color: '#F2705B' },
];

// What earns XP (shown in "How levels work").
export const XP_RULES: { action: string; xp: number; icon: string }[] = [
  { action: 'Cross off a routine task', xp: 10, icon: 'checkmark-circle-outline' },
  { action: 'Log a workout', xp: 40, icon: 'barbell-outline' },
  { action: 'Set a personal record', xp: 25, icon: 'trophy-outline' },
  { action: 'Perfect day (everything crossed off)', xp: 50, icon: 'sunny-outline' },
  { action: 'Keep your streak alive', xp: 5, icon: 'flame-outline' },
  { action: 'Finish a weekly goal', xp: 30, icon: 'flag-outline' },
  { action: 'Finish a yearly goal', xp: 150, icon: 'ribbon-outline' },
];

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => 200 + 40 * level;

export function tierOf(level: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (level >= tier.from) t = tier;
  return t;
}

export function nextTier(level: number): Tier | null {
  return TIERS.find(t => t.from > level) ?? null;
}

/** Level, progress into it, and what's needed, from lifetime XP. */
export function levelFromXp(totalXp: number): { level: number; into: number; needed: number; progress: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  const needed = xpToNext(level);
  return { level, into: rest, needed, progress: rest / needed };
}
