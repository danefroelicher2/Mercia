import {
  ContextBuilder,
  SupabaseStorageAdapter,
  GroqLLMAdapter,
  StorageAdapter,
  LLMAdapter,
} from '@mercia/ai-core';

let storage: StorageAdapter;
let llm: LLMAdapter;
let contextBuilder: ContextBuilder;

/**
 * Initialize Mercia Core
 * Call this once on server startup
 */
export function initializeMerciaCore(): void {
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
    console.warn('  GROQ_API_KEY not set - chat disabled');
    // Create a dummy LLM adapter that returns empty responses
    llm = {
      chat: async () => 'LLM not configured',
      getProvider: () => 'None',
    };
  }

  // Initialize engines
  contextBuilder = new ContextBuilder(storage);

  console.log('  Mercia Core initialized');
}

/**
 * Get initialized engines
 */
export function getContextBuilder(): ContextBuilder {
  if (!contextBuilder) {
    throw new Error('Mercia Core not initialized');
  }
  return contextBuilder;
}

export function getStorage(): StorageAdapter {
  if (!storage) {
    throw new Error('Mercia Core not initialized');
  }
  return storage;
}

export function getLLM(): LLMAdapter {
  if (!llm) {
    throw new Error('Mercia Core not initialized');
  }
  return llm;
}
