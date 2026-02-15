export interface WeeklySummary {
  id: string;
  user_id: string;
  week_start_date: string;
  week_end_date: string;
  nonnegotiables_completed: number;
  nonnegotiables_total: number;
  nonnegotiables_percentage: number;
  nicetohaves_completed: number;
  nicetohaves_total: number;
  nicetohaves_percentage: number;
  best_day_combined: string;
  most_consistent_day: string;
  tasks_missed_frequently: { task_name: string; times_missed: number; day: string }[];
  weekly_goals_completed: number;
  weekly_goals_total: number;
  weekly_goals_percentage: number;
  monthly_goals_total: number;
  monthly_goals_change_from_last_week: number;
  improvement_percentage: number;
  is_improvement: boolean;
  is_saved: boolean;
  has_complete_data: boolean;
  created_at: string;
}
