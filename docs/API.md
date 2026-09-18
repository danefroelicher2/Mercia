# Mercia REST API

Base URL: `https://<render-backend>/api` (local: `http://localhost:3000/api`)

All routes require `Authorization: Bearer <access token>` except `/auth/*` (public) and `/cron/*` (protected by a cron secret, called by schedulers only). Standard response envelope: `{ success: boolean, data?, error? }`. Clients send their IANA timezone (`timezone` in body or query) wherever "today/yesterday" matters — all date math is user-local.

*Updated 2026-07-12. For behavior details see `ARCHITECTURE.md`.*

## /auth
| Method | Path | Purpose |
|---|---|---|
| POST | /register, /login, /refresh | Email auth + token refresh |
| POST | /google, /apple | OAuth sign-in |
| POST | /forgot-password, /change-password | Password management |
| DELETE | /account | Delete account |

## /chat
| Method | Path | Purpose |
|---|---|---|
| POST | /daily-outlook | Find-or-create today's outlook chat (persists per user-local day; opener bakes in yesterday's recap) |
| POST | /day-in-review | Fresh review chat every open. Body `scope: 'today'\|'yesterday'` (default yesterday); `'today'` = evening "Close Out Today" |
| POST | /new, /message | Manual chat create / send message (LLM reply) |
| GET | /list, /:chatId/messages | Chat list / messages |
| POST | /:chatId/pin, /:chatId/unpin | Pin management |
| DELETE | /:chatId | Delete chat |

## /routine
| Method | Path | Purpose |
|---|---|---|
| POST | /tasks | Create task; `targetCount` 1–999 (countdown), optional `timeOfDay` (`morning`/`afternoon`/`night`, default morning), optional `scheduledTime` ("HH:MM") |
| GET | /tasks/:day | Tasks for a weekday |
| PATCH | /tasks/:id | **Tick** (server-side countdown decrement; completes at 0). Side-effects fire on completion transition. Optional `date` for past days this week |
| PATCH | /tasks/reorder | Persist sort order |
| PUT | /tasks/:id | Edit `text`, `timeOfDay`, `targetCount` (retarget keeps taps already made), and/or `scheduledTime` ("HH:MM", `null` = anytime) |
| DELETE | /tasks/:id | Delete + history cleanup |
| POST | /tasks/bulk-delete | `{ ids }` — delete many tasks (multi-select); same history cleanup as single delete |
| PUT | /goals/:id | Edit a goal's `text` and/or `targetCount` (retarget keeps taps made) |
| POST | /goals/bulk-delete | `{ ids }` — delete many goals (multi-select) |
| POST | /clear | Wipe the Routine tab: all tasks (every day), all goals, notepad emptied. Completion history kept; Gym untouched |
| POST | /goals | Create weekly/monthly/yearly goal (`targetCount` optional) |
| GET | /goals/weekly · /monthly · /yearly | Goal lists |
| PATCH | /goals/:id | Tick a goal. On completion, records the goal **by name** into `goal_completion_history` |
| PATCH | /goals/reorder · DELETE /goals/:id | Reorder / delete |
| GET/PUT | /notepad | Persistent notepad (10k chars) |
| GET | /summary-data | Current week routine numbers (full-week possible vs Mon→today completed) — feeds Momentum + Summary Data screen |
| GET/POST | /quotes/* | Quote like counts / user interactions |

## /gym
| Method | Path | Purpose |
|---|---|---|
| GET/PUT | /target | Weekly gym-day target (1–7; default 4 with `isDefault: true`) |
| POST | /log | Upsert today's workout (name + free-text notes); also writes `gym_memory` when notes exist |
| POST | /log/rest | Mark/unmark an intentional rest day (`is_rest` marker; excluded from all gym counts; coach-aware) |
| GET | /log/:dayOfWeek, /week | Day / current-week log |
| GET | /memory | Active memory grouped (≤5 per workout name) |
| GET | /memory/archive | Archived (aged-out) sessions — permanent history. Registered before `/memory/:group` |
| GET | /memory/:group | Active entries for one workout name (pinned first) |
| POST | /memory/entry/:entryId/pin | Pin/unpin (max 3 per group; 409 over limit) |
| DELETE | /memory/entry/:entryId, /memory/:group | Delete entry / whole group (incl. archived) |
| GET/POST/DELETE | /prs, /prs/entry/:id, /prs/:muscleGroup | PR management (5 fixed muscle groups) |

## /stats
| Method | Path | Purpose |
|---|---|---|
| GET | /streaks | Current + longest streak (activity-log RPCs) |
| GET | /heatmap?year&month | Month activity heatmap |
| GET | /week-activity?timezone | Mon–Sun dots for Home week strip |
| GET | /monthly-review?timezone | Prior-month aggregate for Home card (gym approximated from weekly snapshots) |
| GET | /yearly-reviews?timezone | Completed-year card list (gated: year over + ≥1 action) |
| GET | /yearly-review/:year?timezone | Full Wrapped-style review; LLM narrative generated once from complete stats, cached in `yearly_reviews` |
| GET | /achievements, /lifetime | Milestones; lifetime stats (incl. `perfectDays`, gym days from permanent `gym_memory`) |
| POST | /log-activity | Log an activity event (chat sends) |

## /notifications
POST /register (push token), PUT /preferences, POST /ping.

## /cron (secret-protected)
POST /daily-summary, /inactivity, /streak-risk, /summaries/trigger — invoked by schedulers, never by clients.
