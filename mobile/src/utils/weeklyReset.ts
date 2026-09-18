// Shared weekly-reset countdown math. Used by the Routine tab's "This week"
// goal card AND the Home tab's Momentum ring sheet — single source of truth
// so the two timers can never disagree. The reset moment is Monday 5:00 AM
// UTC, matching the display convention the Routine tab has always used.

export const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export const getNextMonday = (): Date => {
  const now = new Date();
  const dayUTC = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // If today is Monday and the reset (5 AM UTC) hasn't happened yet, use today
  if (dayUTC === 1) {
    const todayReset = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0, 0
    ));
    if (now < todayReset) return todayReset;
  }

  const daysUntil = (8 - dayUTC) % 7 || 7;
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil, 5, 0, 0, 0
  ));
};

export const getNextFirstOfMonth = (): Date => {
  const now = new Date();

  // If today is the 1st and the reset hasn't happened yet, use today
  if (now.getUTCDate() === 1) {
    const todayReset = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), 1, 5, 0, 0, 0
    ));
    if (now < todayReset) return todayReset;
  }

  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 5, 0, 0, 0
  ));
};

export const formatTimeRemaining = (ms: number): string => {
  if (ms <= 0) return 'Resetting...';
  const totalMinutes = Math.floor(ms / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (totalHours > 0) return `${totalHours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
};

export const shouldShowUrgent = (ms: number): boolean => ms > 0 && ms < TWELVE_HOURS_MS;

// Convenience: the weekly countdown as display state.
export const getWeeklyCountdown = (): { text: string; urgent: boolean } => {
  const ms = getNextMonday().getTime() - Date.now();
  return { text: formatTimeRemaining(ms), urgent: shouldShowUrgent(ms) };
};

// How much of the current week / month has passed (0–1), on the same reset
// clock as the countdowns above — drives the goal cards' progress bars.
const DAY_MS = 24 * 60 * 60 * 1000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const getWeekElapsedFraction = (): number => {
  const end = getNextMonday().getTime();
  const start = end - 7 * DAY_MS;
  return clamp01((Date.now() - start) / (end - start));
};

export const getMonthElapsedFraction = (): number => {
  const endDate = getNextFirstOfMonth();
  const end = endDate.getTime();
  const start = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 1, 1, 5, 0, 0, 0);
  return clamp01((Date.now() - start) / (end - start));
};
