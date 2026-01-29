import {
  QuestionEngine,
  MemoryManager,
  ContextBuilder,
  SupabaseStorageAdapter,
  GroqLLMAdapter,
  StorageAdapter,
  LLMAdapter,
} from '@oasis/ai-core';

let storage: StorageAdapter;
let llm: LLMAdapter;
let questionEngine: QuestionEngine;
let memoryManager: MemoryManager;
let contextBuilder: ContextBuilder;

/**
 * Initialize Oasis AI Core
 * Call this once on server startup
 */
export function initializeOasisCore(): void {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  // Initialize storage adapter
  storage = new SupabaseStorageAdapter(supabaseUrl, supabaseKey);
  console.log('  Storage adapter initialized (Supabase)');

  // Initialize LLM adapter (graceful degradation if no API key)
  if (groqApiKey) {
    llm = new GroqLLMAdapter(groqApiKey);
    console.log('  LLM adapter initialized (Groq)');
  } else {
    console.warn('  GROQ_API_KEY not set - insight extraction disabled');
    // Create a dummy LLM adapter that returns empty insights
    llm = {
      chat: async () => 'LLM not configured',
      extractInsights: async () => ({}),
      getProvider: () => 'None',
    };
  }

  // Initialize engines
  questionEngine = new QuestionEngine(storage);
  memoryManager = new MemoryManager(storage, llm);
  contextBuilder = new ContextBuilder(storage, memoryManager);

  console.log('  Oasis AI Core initialized');
}

/**
 * Get initialized engines
 */
export function getQuestionEngine(): QuestionEngine {
  if (!questionEngine) {
    throw new Error('Oasis Core not initialized');
  }
  return questionEngine;
}

export function getMemoryManager(): MemoryManager {
  if (!memoryManager) {
    throw new Error('Oasis Core not initialized');
  }
  return memoryManager;
}

export function getContextBuilder(): ContextBuilder {
  if (!contextBuilder) {
    throw new Error('Oasis Core not initialized');
  }
  return contextBuilder;
}

export function getStorage(): StorageAdapter {
  if (!storage) {
    throw new Error('Oasis Core not initialized');
  }
  return storage;
}

export function getLLM(): LLMAdapter {
  if (!llm) {
    throw new Error('Oasis Core not initialized');
  }
  return llm;
}
