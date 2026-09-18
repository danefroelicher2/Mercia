import { RoutineTask, TimeOfDay } from '../types/routine';

export const TIME_OF_DAY_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'night'];

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  night: 'Night',
};

// ============================================
// Section boundaries
// Morning runs from midnight to afternoonStart, afternoon to nightStart,
// night to midnight. Both are minutes after midnight and user-adjustable
// (Routine settings); defaults are noon and 6 PM.
// ============================================

export interface DayBoundaries {
  afternoonStart: number;
  nightStart: number;
}

export const DEFAULT_BOUNDARIES: DayBoundaries = { afternoonStart: 12 * 60, nightStart: 18 * 60 };

export const BOUNDARY_STEP = 30;
const AFTERNOON_EARLIEST = 6 * 60;
const NIGHT_LATEST = 23 * 60 + 30;
const MIN_SECTION = 60;

// Always returns a valid pair: on the step grid, in range, and leaving each
// section at least an hour. Anything unparseable falls back to the default.
export function clampBoundaries(input: Partial<DayBoundaries>): DayBoundaries {
  const snap = (v: number | undefined, fallback: number) =>
    Number.isFinite(v) ? Math.round((v as number) / BOUNDARY_STEP) * BOUNDARY_STEP : fallback;
  let afternoonStart = snap(input.afternoonStart, DEFAULT_BOUNDARIES.afternoonStart);
  let nightStart = snap(input.nightStart, DEFAULT_BOUNDARIES.nightStart);
  afternoonStart = Math.min(Math.max(afternoonStart, AFTERNOON_EARLIEST), NIGHT_LATEST - MIN_SECTION);
  nightStart = Math.min(Math.max(nightStart, afternoonStart + MIN_SECTION), NIGHT_LATEST);
  return { afternoonStart, nightStart };
}

// Allowed range for each boundary given the other one.
export function boundaryLimits(b: DayBoundaries) {
  return {
    afternoonStart: { min: AFTERNOON_EARLIEST, max: b.nightStart - MIN_SECTION },
    nightStart: { min: b.afternoonStart + MIN_SECTION, max: NIGHT_LATEST },
  };
}

// [start, end) in minutes after midnight.
export function sectionRange(section: TimeOfDay, b: DayBoundaries = DEFAULT_BOUNDARIES): [number, number] {
  if (section === 'morning') return [0, b.afternoonStart];
  if (section === 'afternoon') return [b.afternoonStart, b.nightStart];
  return [b.nightStart, 24 * 60];
}

export function sectionForMinutes(minutes: number, b: DayBoundaries = DEFAULT_BOUNDARIES): TimeOfDay {
  if (minutes < b.afternoonStart) return 'morning';
  if (minutes < b.nightStart) return 'afternoon';
  return 'night';
}

export function getCurrentTimeOfDay(now: Date = new Date(), b: DayBoundaries = DEFAULT_BOUNDARIES): TimeOfDay {
  return sectionForMinutes(now.getHours() * 60 + now.getMinutes(), b);
}

// 750 → "12:30 PM"
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function taskTimeOfDay(task: RoutineTask): TimeOfDay {
  return task.time_of_day ?? 'morning';
}

// "Pushups x3" / "Water ×8" → { text: 'Pushups', targetCount: 3 }.
// A bare "x3" with nothing before it stays literal text.
export function parseCountSuffix(raw: string): { text: string; targetCount: number | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.*\S)\s+[x×](\d{1,3})$/i);
  if (!match) return { text: trimmed, targetCount: null };
  const count = parseInt(match[2], 10);
  if (count < 1) return { text: trimmed, targetCount: null };
  return { text: match[1], targetCount: count };
}

// Each section's color — morning sky, afternoon sun, night indigo. The
// Routine tab takes its accent from whichever section is showing.
export const SECTION_COLORS: Record<TimeOfDay, string> = {
  morning: '#86CCF4',
  afternoon: '#F3BF4C',
  night: '#7482F5',
};

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Dark text on light accents (sky, gold), white on dark ones (indigo).
export function textOnColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0D0D0D' : '#FFFFFF';
}

// ============================================
// Scheduled times ("HH:MM", 24h)
// ============================================

// Read what the user typed — "8", "830", "8:45", "7p", "14" — as a 24h
// "HH:MM". A bare 1–12 hour picks AM or PM by the item's section (8 on a
// Morning item → 8:00 AM, on a Night item → 8:00 PM); "a"/"p" overrides.
export function parseTimeInput(
  raw: string,
  section: TimeOfDay,
  boundaries: DayBoundaries = DEFAULT_BOUNDARIES,
): string | null {
  const match = raw.trim().toLowerCase().match(/^(\d{1,2})(?:[:.\s]?(\d{2}))?\s*(a|am|p|pm)?$/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const suffix = match[3]?.[0];
  if (minute > 59) return null;

  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (suffix === 'p' ? 12 : 0);
  } else if (hour >= 1 && hour <= 12) {
    const am = hour % 12;
    const pm = am + 12;
    const [start, end] = sectionRange(section, boundaries);
    const fits = (h: number) => h * 60 + minute >= start && h * 60 + minute < end;
    if (hour === 12) hour = 12; // bare 12 reads as noon
    else if (fits(am)) hour = am;
    else if (fits(pm)) hour = pm;
    else hour = section === 'morning' ? am : pm;
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// "07:15" → { time: '7:15', period: 'AM' }
export function formatTime(value: string): { time: string; period: 'AM' | 'PM' } {
  const [h, m] = value.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { time: `${hour12}:${String(m).padStart(2, '0')}`, period };
}

export function formatTimeLabel(value: string): string {
  const { time, period } = formatTime(value);
  return `${time} ${period}`;
}

// Flip a stored time between AM and PM.
export function togglePeriod(value: string): string {
  const [h, m] = value.split(':').map(Number);
  return `${String((h + 12) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

const toHHMM = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Four one-tap times inside a section for the time picker. With the default
// boundaries: 6/7/8/9 AM, 12/1/3/5 PM, 6/8/9/10 PM.
export function quickTimes(section: TimeOfDay, b: DayBoundaries = DEFAULT_BOUNDARIES): string[] {
  const [start, end] = sectionRange(section, b);
  const offsets: Record<TimeOfDay, number[]> = {
    morning: [end - 360, end - 300, end - 240, end - 180],
    afternoon: [start, start + 60, start + 180, end - 60],
    night: [start, start + 120, start + 180, start + 240],
  };
  const inRange = (m: number) => m >= start && m < end;
  const picks: number[] = [];
  for (const m of offsets[section]) {
    if (inRange(m) && !picks.includes(m)) picks.push(m);
  }
  // Short sections: fill with the remaining whole steps from the start.
  for (let m = start; picks.length < 4 && m < end; m += 60) {
    if (!picks.includes(m)) picks.push(m);
  }
  return picks.sort((x, y) => x - y).slice(0, 4).map(toHHMM);
}
