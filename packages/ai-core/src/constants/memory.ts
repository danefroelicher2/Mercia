export const MEMORY_CAPS = {
  QUESTION_FACTS_MAX: 40,
  CONVERSATION_FACTS_MAX: 60,
} as const;

export const CONVERSATION_COMMIT_THRESHOLDS = {
  MIN_SOURCE_COUNT: 3,            // Must be seen across 3+ separate chat sessions
  HIGH_IMPORTANCE_OVERRIDE: 0.85, // OR single session with importance above this
  MIN_USER_MESSAGES_FOR_OVERRIDE: 8, // AND that session must have 8+ user messages
} as const;
