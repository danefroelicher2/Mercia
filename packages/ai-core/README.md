# @oasis/ai-core

Portable AI memory engine. Platform-agnostic, cost-optimized.

## Philosophy

This package contains ZERO platform-specific code. It can run:
- In Node.js backend
- In React Native mobile app
- On Raspberry Pi
- In Electron desktop app
- In browser with WASM (future)

## Core Components

- **QuestionEngine** - Daily question rotation with skip tracking
- **MemoryManager** - Builds user profiles from structured data
- **ContextBuilder** - Smart context selection for LLM (keeps costs low)

## Usage
```typescript
import { QuestionEngine, SupabaseAdapter } from '@oasis/ai-core';

const storage = new SupabaseAdapter(supabaseUrl, supabaseKey);
const engine = new QuestionEngine(storage);

// Get today's question
const question = await engine.getDailyQuestion(userId);

// Submit answer
await engine.submitAnswer(userId, questionId, responseText);
```
