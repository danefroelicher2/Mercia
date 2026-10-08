export type TimeOfDay = 'morning' | 'afternoon' | 'night';

// Where a task sits in the day: a part of the day, or Anytime (newly added,
// not yet given a time).
export type TaskSection = TimeOfDay | 'anytime';

export interface RoutineTask {
  id: string;
  user_id: string;
  text: string;
  type: 'today';
  day_of_week: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  completed: boolean;
  target_count: number;
  current_count: number;
  // Optional: rows served by a backend that predates the column read as 'morning'.
  time_of_day?: TaskSection;
  // Optional clock time within the section, 24h "HH:MM"; null/absent = anytime.
  scheduled_time?: string | null;
  created_at: string;
}

export interface RoutineGoal {
  id: string;
  user_id: string;
  text: string;
  type: 'weekly' | 'monthly' | 'yearly';
  week_number: number | null;
  month: number | null;
  year: number;
  completed: boolean;
  completed_at: string | null;
  target_count: number;
  current_count: number;
  created_at: string;
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
