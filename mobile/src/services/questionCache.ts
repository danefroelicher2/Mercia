// Helper functions to cache question state locally
// This prevents refetching after user has answered/skipped today's question

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY_PREFIX = 'mercia_question_';

export interface CachedQuestionState {
  date: string; // YYYY-MM-DD
  questionId: string;
  questionText: string;
  category: string;
  state: 'answered' | 'skipped';
  userAnswer?: string; // Only if answered
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date string is from today
 */
function isToday(dateString: string): boolean {
  return dateString === getTodayDateString();
}

/**
 * Generate cache key for a user
 */
function getCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

/**
 * Save today's question state to cache
 */
export async function cacheQuestionState(
  userId: string,
  questionId: string,
  questionText: string,
  category: string,
  state: 'answered' | 'skipped',
  userAnswer?: string
): Promise<void> {
  try {
    const cacheData: CachedQuestionState = {
      date: getTodayDateString(),
      questionId,
      questionText,
      category,
      state,
      userAnswer,
    };

    const cacheKey = getCacheKey(userId);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`[QuestionCache] Saved state: ${state} for question ${questionId}`);
  } catch (error) {
    console.error('[QuestionCache] Error saving cache:', error);
    // Don't throw - cache failure shouldn't break the app
  }
}

/**
 * Get cached state for today (returns null if no cache or cache is from a different day)
 */
export async function getCachedQuestionState(
  userId: string
): Promise<CachedQuestionState | null> {
  try {
    const cacheKey = getCacheKey(userId);
    const cachedData = await AsyncStorage.getItem(cacheKey);

    if (!cachedData) {
      console.log('[QuestionCache] No cached state found');
      return null;
    }

    const parsed: CachedQuestionState = JSON.parse(cachedData);

    // Check if cache is from today
    if (!isToday(parsed.date)) {
      console.log(`[QuestionCache] Cache is from ${parsed.date}, not today (${getTodayDateString()})`);
      return null;
    }

    console.log(`[QuestionCache] Found valid cache: ${parsed.state} for question ${parsed.questionId}`);
    return parsed;
  } catch (error) {
    console.error('[QuestionCache] Error reading cache:', error);
    return null;
  }
}

/**
 * Clear cache for a user (for testing or manual reset)
 */
export async function clearQuestionCache(userId: string): Promise<void> {
  try {
    const cacheKey = getCacheKey(userId);
    await AsyncStorage.removeItem(cacheKey);
    console.log('[QuestionCache] Cache cleared');
  } catch (error) {
    console.error('[QuestionCache] Error clearing cache:', error);
  }
}
