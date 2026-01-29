# Oasis AI

Cost-efficient AI memory platform that deeply understands users through structured data collection and intelligent conversation.

## Architecture
```
┌─────────────────────────────┐
│    @oasis/ai-core           │  ← Portable AI memory logic
│    (TypeScript Package)     │
└─────────────┬───────────────┘
              │
┌─────────────▼───────────────┐
│    Backend API              │  ← REST API (Node.js + Express)
│    (Exposes AI Core)        │
└─────────────┬───────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
  Mobile   Desktop   Raspberry Pi
```

## Core Philosophy

1. **Memory Over Messages:** Build deep user understanding, not just chat history
2. **Cost Efficiency:** Every architectural decision optimized for scaling profitably
3. **Portability:** AI Core works anywhere - mobile, desktop, IoT devices
4. **Provider Agnostic:** Swap databases, LLMs, storage without rewriting logic

## Project Structure

- `packages/ai-core/` - Standalone AI memory engine
- `backend/` - REST API server
- `docs/` - Architecture and API documentation

## Getting Started
```bash
# Install dependencies
npm install

# Set up environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

# Start development server
npm run dev
```

## Tech Stack

- **AI Core:** TypeScript, database-agnostic, LLM-agnostic
- **Backend:** Node.js, Express, TypeScript, Supabase
- **LLM:** Groq API (primary), Ollama (batch processing)
- **Database:** PostgreSQL (via Supabase)

## License

Private - All Rights Reserved
