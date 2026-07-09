export interface WeeklySummary {
  id: string;
  user_id: string;
  week_start_date: string;
  week_end_date: string;

  // Task completion
  today_completed: number;
  today_total: number;
  today_percentage: number;

  // Today's tasks that weren't crossed off
  tasks_missed_frequently: { task_id?: string; task_name: string }[];
  weekly_missed_tasks?: { task_id: string; task_name: string; times_missed: number }[];

  // Overall computed percentage (stored backend-side)
  overall_percentage: number;
  yesterday_overall_percentage: number;

  // Weekly goals
  weekly_goals_completed: number;
  weekly_goals_total: number;
  weekly_goals_percentage: number;
  completed_weekly_goal_texts: string[];
  weekly_goals_change_today: number;

  // Monthly goals
  monthly_goals_total: number;
  monthly_goals_completed: number;
  monthly_goals_percentage: number;
  monthly_goals_change_from_last_week: number;
  completed_monthly_goal_texts: string[];
  monthly_goals_change_today: number;

  // Performance
  improvement_percentage: number;
  is_improvement: boolean;

  // Legacy fields (kept for history screen compat)
  best_day_combined: string;
  most_consistent_day: string;

  // Gym tracking
  gym_days_this_week?: number;
  gym_days_possible?: number;

  // Meta
  is_saved: boolean;
  has_complete_data: boolean;
  created_at: string;
}
