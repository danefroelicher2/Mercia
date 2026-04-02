// Types for the daily questions feature

export interface DailyQuestion {
  question_id: string;
  question_text: string;
  category: string;
  assigned_date: string;
  skip_count: number;
}

export interface QuestionResponse {
  id: string;
  user_id: string;
  question_id: string;
  response_text: string;
  answered_at: string;
}

export interface DailyQuestionApiResponse {
  success: boolean;
  data: DailyQuestion | null;
}

export interface AnswerApiResponse {
  success: boolean;
  message: string;
  data: {
    response: QuestionResponse;
    progress: {
      totalAnswered: number;
      currentStreak: number;
    };
    can_continue: boolean;
  };
}

export interface SkipApiResponse {
  success: boolean;
  message: string;
}

// Question section states
export type QuestionState = 'loading' | 'unanswered' | 'answered' | 'skipped' | 'all_done' | 'error';
