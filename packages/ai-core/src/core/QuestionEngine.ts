import { StorageAdapter } from '../adapters/storage';
import { DailyQuestionForUser, QuestionResponse, UserProgress } from '../types';

/**
 * QuestionEngine
 * Handles daily question rotation, answer submission, and skip tracking
 */
export class QuestionEngine {
  constructor(private storage: StorageAdapter) {}

  /**
   * Get today's unanswered question for a user
   * Returns null if user has answered all questions
   */
  async getTodaysQuestion(userId: string): Promise<DailyQuestionForUser | null> {
    return await this.storage.getDailyQuestionForUser(userId);
  }

  /**
   * Submit an answer to a question
   * Validates input and saves response
   */
  async submitAnswer(
    userId: string,
    questionId: string,
    responseText: string
  ): Promise<QuestionResponse> {
    // Validate input
    if (!responseText || responseText.trim().length === 0) {
      throw new Error('Response text cannot be empty');
    }

    if (responseText.length < 10) {
      throw new Error('Response must be at least 10 characters');
    }

    if (responseText.length > 5000) {
      throw new Error('Response must be less than 5000 characters');
    }

    // Save response
    const response = await this.storage.saveQuestionResponse(
      userId,
      questionId,
      responseText.trim()
    );

    return response;
  }

  /**
   * Skip today's question
   * After 3 skips, automatically marks as answered
   */
  async skipQuestion(userId: string, questionId: string): Promise<void> {
    const today = new Date();
    await this.storage.skipQuestion(userId, questionId, today);
  }

  /**
   * Get user's question answering progress
   */
  async getProgress(userId: string): Promise<UserProgress> {
    return await this.storage.getUserQuestionStats(userId);
  }

  /**
   * Get user's answered questions history
   */
  async getHistory(userId: string, limit: number = 50): Promise<QuestionResponse[]> {
    return await this.storage.getQuestionHistory(userId, limit);
  }

  /**
   * Check if user has answered today's question
   */
  async hasAnsweredToday(userId: string): Promise<boolean> {
    const question = await this.getTodaysQuestion(userId);
    return question === null; // No question = already answered
  }
}
