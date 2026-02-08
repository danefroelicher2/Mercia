export * from './Question';
export * from './Response';
export * from './Memory';
export * from './Chat';
export * from './Routine';

// Progress tracking
export interface UserProgress {
  answered: number;
  total: number;
  percentage: number;
  streak_days: number;
}

// API response wrapper
export interface OasisResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
