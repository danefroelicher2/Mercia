export interface DailyQuestion {
  id: string;
  question_text: string;
  category: 'values' | 'beliefs' | 'goals' | 'experiences' | 'relationships' | 'decision_making';
  difficulty: 'easy' | 'medium' | 'deep';
  level: number;
  tags: string[];
  created_at: Date;
}

export interface UserDailyQuestion {
  id: string;
  user_id: string;
  question_id: string;
  assigned_date: Date;
  answered: boolean;
  skipped_on: Date[];
  created_at: Date;
}

export interface DailyQuestionForUser {
  question_id: string;
  question_text: string;
  category: string;
  level: number;
  assigned_date: Date;
  skip_count: number;
}
