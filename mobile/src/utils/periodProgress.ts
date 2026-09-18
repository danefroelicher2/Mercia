// Where "now" falls within the current week, month and year, on the user's
// local calendar — drives the goal cards' "Day x of y" and progress bars.
// Day counts come from calendar dates (not elapsed milliseconds), so leap
// years, 28/29/30/31-day months and daylight-saving shifts all come out right.

export interface PeriodInfo {
  day: number; // 1-based day within the period
  total: number; // days in the period (7, 28–31, 365/366)
  daysLeft: number; // whole days after today
  progress: number; // 0–1, including how far through today we are
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

export const daysInYear = (year: number): number => (isLeapYear(year) ? 366 : 365);

// Calendar-date difference via UTC day numbers — immune to DST hour shifts.
const dayNumber = (year: number, monthIndex: number, date: number) =>
  Math.round(Date.UTC(year, monthIndex, date) / DAY_MS);

export const dayOfYear = (d: Date): number =>
  dayNumber(d.getFullYear(), d.getMonth(), d.getDate()) - dayNumber(d.getFullYear(), 0, 1) + 1;

// Monday = 1 … Sunday = 7
export const dayOfWeek = (d: Date): number => ((d.getDay() + 6) % 7) + 1;

const fractionOfToday = (d: Date): number =>
  (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;

const info = (day: number, total: number, d: Date): PeriodInfo => ({
  day,
  total,
  daysLeft: total - day,
  progress: Math.min(1, Math.max(0, (day - 1 + fractionOfToday(d)) / total)),
});

export const weekInfo = (d: Date = new Date()): PeriodInfo => info(dayOfWeek(d), 7, d);

export const monthInfo = (d: Date = new Date()): PeriodInfo =>
  info(d.getDate(), daysInMonth(d.getFullYear(), d.getMonth()), d);

export const yearInfo = (d: Date = new Date()): PeriodInfo =>
  info(dayOfYear(d), daysInYear(d.getFullYear()), d);

// "12 days left" / "1 day left" / "Last day"
export const daysLeftLabel = (daysLeft: number): string =>
  daysLeft <= 0 ? 'Last day' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
