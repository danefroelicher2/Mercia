# @mercia/ai-core

Portable AI chat/context engine. Platform-agnostic, cost-optimized.

## Philosophy

This package contains ZERO platform-specific code. It can run:
- In Node.js backend
- In React Native mobile app
- On Raspberry Pi
- In Electron desktop app
- In browser with WASM (future)

## Core Components

- **ContextBuilder** - Builds chat context (system prompt + conversation history) for the LLM

## Usage
```typescript
import { ContextBuilder, SupabaseStorageAdapter } from '@mercia/ai-core';

const storage = new SupabaseStorageAdapter(supabaseUrl, supabaseKey);
const contextBuilder = new ContextBuilder(storage);
```
