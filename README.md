# Mercia

A personal AI coach for routine + gym lifestyle management: habit tracking, free-text workout logging, progress rings, and an LLM that talks to you about *your actual behavioral data*.

## Core Philosophy

1. **Memory Over Messages:** Build deep user understanding, not just chat history
2. **Cost Efficiency:** Every architectural decision optimized for scaling profitably
3. **Portability:** AI Core works anywhere - mobile, desktop, IoT devices
4. **Provider Agnostic:** Swap databases, LLMs, storage without rewriting logic

## Tech Stack

- **Mobile:** React Native / Expo (EAS builds), RevenueCat subscriptions
- **AI Core:** TypeScript (`packages/ai-core`), database-agnostic, LLM-agnostic — backend consumes its built `dist/`
- **Backend:** Node.js, Express, TypeScript on Render
- **LLM:** Groq API
- **Database:** PostgreSQL via Supabase (schema `oasis`, service-role access only)

## Documentation (`docs/`)

- `ARCHITECTURE.md` — system overview, data flow, resets, what persists
- `API.md` — endpoint index
- `DATABASE_SCHEMA.sql` — live-schema reference snapshot
