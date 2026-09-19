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

export const formatTimeRemaining = (ms: number, suffix: string = 'remaining'): string => {
  if (ms <= 0) return 'Resetting...';
  const totalMinutes = Math.floor(ms / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${suffix}`;
  if (totalHours > 0) return `${totalHours}h ${minutes}m ${suffix}`;
  return `${minutes}m ${suffix}`;
};

// Spelled-out version for the Weekly goal card: "2 days 4 hours left",
// "1 day 1 hour left", "5 hours 12 minutes left", "12 minutes left".
export const formatTimeLeftLong = (ms: number): string => {
  if (ms <= 0) return 'Resetting...';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const totalMinutes = Math.floor(ms / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${plural(days, 'day')} ${plural(hours, 'hour')} left` : `${plural(days, 'day')} left`;
  if (totalHours > 0) return minutes > 0 ? `${plural(totalHours, 'hour')} ${plural(minutes, 'minute')} left` : `${plural(totalHours, 'hour')} left`;
  return minutes > 0 ? `${plural(minutes, 'minute')} left` : 'Less than a minute left';
};

export const shouldShowUrgent = (ms: number): boolean => ms > 0 && ms < TWELVE_HOURS_MS;

// Convenience: the weekly countdown as display state.
export const getWeeklyCountdown = (): { text: string; urgent: boolean } => {
  const ms = getNextMonday().getTime() - Date.now();
  return { text: formatTimeRemaining(ms), urgent: shouldShowUrgent(ms) };
};

