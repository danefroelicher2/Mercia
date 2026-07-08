export interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: 'ai_chat_sent' | 'task_completed' | 'goal_completed';
  activity_date: string;  // YYYY-MM-DD
  created_at: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  requirement_type: 'streak' | 'chat_total' | 'routine_weekly_completion' | 'task_total';
  requirement_value: number;
  icon?: string;
  display_order: number;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: {
    length: number;
    endedAt: string | null;
    isCurrent: boolean;
  };
}

export interface HeatmapData {
  year: number;
  month: number;
  days: Array<{
    date: string;
    count: number;
  }>;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export interface AchievementWithProgress extends Achievement {
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
  requirement: number;
}
