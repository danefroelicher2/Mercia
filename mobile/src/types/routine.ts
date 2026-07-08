export interface RoutineTask {
  id: string;
  user_id: string;
  text: string;
  type: 'non-negotiable' | 'nice-to-have';
  day_of_week: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  completed: boolean;
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
