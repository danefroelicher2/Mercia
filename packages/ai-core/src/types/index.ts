export * from './Chat';
export * from './Routine';

// API response wrapper
export interface MerciaResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
