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
