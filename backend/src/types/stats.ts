export interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: 'ai_chat_sent' | 'task_completed' | 'goal_completed';
  activity_date: string;  // YYYY-MM-DD
  created_at: string;
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
