import { RoutineTask, TimeOfDay } from '../types/routine';

export const TIME_OF_DAY_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'night'];

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  night: 'Night',
};

// Midnight–noon is morning, noon–6pm afternoon, 6pm–midnight night.
export function getCurrentTimeOfDay(now: Date = new Date()): TimeOfDay {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'night';
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

const SECTION_HOURS: Record<TimeOfDay, [number, number]> = {
  morning: [0, 12],
  afternoon: [12, 18],
  night: [18, 24],
};

// Read what the user typed — "8", "830", "8:45", "7p", "14" — as a 24h
// "HH:MM". A bare 1–12 hour picks AM or PM by the item's section (8 on a
// Morning item → 8:00 AM, on a Night item → 8:00 PM); "a"/"p" overrides.
export function parseTimeInput(raw: string, section: TimeOfDay): string | null {
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
    const [start, end] = SECTION_HOURS[section];
    const fits = (h: number) => h >= start && h < end;
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

// A few one-tap times per section for the time picker.
export const QUICK_TIMES: Record<TimeOfDay, string[]> = {
  morning: ['06:00', '07:00', '08:00', '09:00'],
  afternoon: ['12:00', '13:00', '15:00', '17:00'],
  night: ['18:00', '20:00', '21:00', '22:00'],
};
