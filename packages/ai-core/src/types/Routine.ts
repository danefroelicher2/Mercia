export type TimeOfDay = 'morning' | 'afternoon' | 'night';

export interface RoutineTask {
  id: string;
  user_id: string;
  text: string;
  type: 'today';
  day_of_week: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  completed: boolean;
  target_count: number;
  current_count: number;
  time_of_day: TimeOfDay;
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
