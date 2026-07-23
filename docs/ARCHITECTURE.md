# Mercia Architecture

*Updated 2026-07-12. Companion docs: `API.md` (endpoint index), `DATABASE_SCHEMA.sql` (schema snapshot).*

## Core Principle: Memory Over Messages

Traditional AI chat stores every message and searches with vectors. Mercia compresses behavior into compact, structured per-day records and hands the LLM a short natural-language log instead — pennies per user per month (Groq `llama-3.3-70b`), and the coach's knowledge is *numbers about you*, not chat history.

## Stack & Layout (npm workspaces monorepo)

| Piece | Tech | Where |
|---|---|---|
| Mobile app | React Native / Expo (dev builds via EAS) | `mobile/` |
| API server | Node/Express on Render, deploys from `main` | `backend/` |
| Shared core | `@mercia/ai-core` — storage adapter (all Supabase access) + LLM adapter. **Backend imports its built `dist/`** — run `npm run build --workspace=@mercia/ai-core` after editing it | `packages/ai-core/` |
| Data/auth | Supabase Postgres, schema `oasis` | — |
| LLM | Groq | via ai-core LLM adapter |
| Subscriptions | RevenueCat | mobile |

**Access model:** the app never talks to Supabase directly — every request goes through Express with a Supabase **service-role** key. All user tables have RLS enabled with no policies (deny-all for anon/authenticated keys; service role bypasses). Every route derives `userId` from the JWT and must filter on it.

## The Daily Loop

```
Routine/Gym tab (log work) ──► oasis tables ──► Home rings (Today % / weekly Momentum)
                                   │
        6am pg_cron: one summary row per day (weekly_summaries)
                                   │
        LLM context builders (dailyChatContext.ts): month log + yesterday log
                                   │
        Home check-in card (time-of-day adaptive) ──► Groq ──► coach conversation
```

## Time & Resets (one clock)

- All "today/yesterday" math uses the **client-sent IANA timezone**; the server never assumes its own clock.
- **Monday 6:10 AM ET** (Node cron, `extractionJob.ts`): task completions + countdown counts reset, weekly goals re-keyed + reset, `gym_workout_log` wiped (its content already captured in `gym_memory`).
- **1st of month, midnight ET**: monthly goals reset.
- Client-side countdown display shares one util (`mobile/src/utils/weeklyReset.ts`) so Routine-tab and Momentum-sheet timers never drift.

## What Survives Forever (the memory the coach builds on)

- `task_completion_history` — every task completion **by name**, per date
- `goal_completion_history` — every goal completion **by name**, per date (since 2026-07-12)
- `gym_memory` — every gym session with notes; ≤5 active per workout name, overflow **archived** (never deleted); pins (≤3/group) never age out
- `weekly_summaries` — one row per day of computed stats (misnamed; it's daily)
- `user_activity_log` — every action event (streaks, heatmap, lifetime)
- `yearly_reviews` — cached Wrapped-style narrative per completed year

Rest days (`gym_workout_log.is_rest`) are intentional recovery: excluded from every gym count, and described to the LLM as "planned rest day, not a skip."

## Jobs & Notifications

Node crons: weekly/monthly resets (`extractionJob.ts`), inactivity + streak-risk pushes. Supabase pg_cron: daily summary generation. Push via Expo tokens (`push_tokens`, `notification_preferences`); `/api/cron/*` endpoints are secret-protected scheduler entry points.
