// @mercia/ai-core - Portable AI chat/context engine
// Entry point for the package

// Core Engines
export { ContextBuilder } from './core/ContextBuilder';

// Adapters
export * from './adapters/storage';
export * from './adapters/llm';

// Types
export * from './types';

// Version
export const VERSION = '0.1.0';
