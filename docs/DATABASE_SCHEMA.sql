-- ============================================================
-- MERCIA — DATABASE SCHEMA REFERENCE (schema: oasis)
-- ============================================================
-- Snapshot generated from the LIVE Supabase project on 2026-07-12.
-- This is DOCUMENTATION, not a migration. Per project convention
-- (CLAUDE.md), schema changes are applied directly to Supabase —
-- never as migration files. Regenerate this from
-- information_schema when tables change.
--
-- RLS posture: RLS is ENABLED on all user tables with NO policies
-- (deny-all for anon/authenticated keys). The backend uses the
-- service-role key, which bypasses RLS; the mobile app has no
-- direct Supabase access. If any client-side Supabase usage is
-- ever added, per-user policies must be written first.
-- ============================================================

-- ============================================
-- USERS
-- ============================================
-- Extends auth.users. gym_target_days: weekly gym-day target (1-7),
-- NULL = never set (app defaults to 4, labeled "default").
CREATE TABLE oasis.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_active_at timestamptz,
  gym_target_days int CHECK (gym_target_days BETWEEN 1 AND 7)
);

-- ============================================
-- CHAT
-- ============================================
CREATE TABLE oasis.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New Chat',   -- 'Daily Outlook' / 'Day in Review' / 'Close Out Today' key the daily chats
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  pinned boolean DEFAULT false,
  pinned_at timestamptz
);

CREATE TABLE oasis.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,                        -- 'user' | 'assistant'
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- ROUTINE (tasks + goals + notepad)
-- ============================================
-- Tasks are per-weekday templates. Countdown: current_count counts
-- DOWN from target_count to 0 (= complete); weekly reset restores it.
CREATE TABLE oasis.routine_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text NOT NULL,
  type text NOT NULL,                        -- always 'today'
  day_of_week text NOT NULL,                 -- 'monday'..'sunday'
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  sort_order int DEFAULT 0,
  target_count int NOT NULL DEFAULT 1,       -- 1-999
  current_count int NOT NULL DEFAULT 1,
  time_of_day text NOT NULL DEFAULT 'morning' -- 'morning' | 'afternoon' | 'night' (Today card section)
    CHECK (time_of_day IN ('morning', 'afternoon', 'night'))
);

CREATE TABLE oasis.routine_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text NOT NULL,
  type text NOT NULL,                        -- 'weekly' | 'monthly' | 'yearly'
  week_number int,                           -- weekly only
  month int,                                 -- monthly only
  year int,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  sort_order int DEFAULT 0,
  target_count int NOT NULL DEFAULT 1,
  current_count int NOT NULL DEFAULT 1,
  completed_at timestamptz                   -- drives ring "done before today" math
);

CREATE TABLE oasis.routine_notepad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                     -- UNIQUE (upsert onConflict user_id)
  content text NOT NULL DEFAULT '',          -- max 10k enforced at API
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- PERMANENT HISTORY (what the coach/reviews build on)
-- ============================================
-- Every task completion BY NAME per date. Upserted on completion,
-- deleted on un-complete. Survives task deletion/edit.
CREATE TABLE oasis.task_completion_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_text text NOT NULL,
  task_type text NOT NULL,
  day_of_week text NOT NULL,
  completed boolean NOT NULL DEFAULT true,
  snapshot_date date NOT NULL,               -- user-local date
  created_at timestamptz DEFAULT now()
  -- UNIQUE (user_id, task_id, snapshot_date)
);

-- Every goal completion BY NAME per date (added 2026-07-12; enables
-- yearly-review rankings and name-aware coaching). Same lifecycle as
-- task history. History starts at that date — nothing earlier exists.
CREATE TABLE oasis.goal_completion_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  goal_text text NOT NULL,
  goal_type text NOT NULL,                   -- 'weekly' | 'monthly' | 'yearly'
  completed_date date NOT NULL,              -- user-local date
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, goal_id, completed_date)
);

-- One row per user per DAY (name is historical). Written by the daily
-- summary pipeline; feeds LLM month-log context, Momentum routine
-- numbers (via summary-data), monthly review, perfect days.
CREATE TABLE oasis.weekly_summaries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  week_start_date date NOT NULL,
  week_end_date date NOT NULL,               -- effectively the row's DAY
  today_completed int NOT NULL,
  today_total int NOT NULL,
  today_percentage numeric NOT NULL,
  best_day_combined text,
  most_consistent_day text,
  tasks_missed_frequently jsonb,
  weekly_goals_completed int NOT NULL,
  weekly_goals_total int NOT NULL,
  weekly_goals_percentage numeric NOT NULL,
  monthly_goals_total int,
  monthly_goals_change_from_last_week int,
  improvement_percentage numeric,
  is_improvement boolean,
  created_at timestamptz DEFAULT now(),
  is_saved boolean DEFAULT false,
  has_complete_data boolean DEFAULT true,
  overall_percentage int DEFAULT 0,
  yesterday_overall_percentage int DEFAULT 0,
  completed_weekly_goal_texts text[] DEFAULT '{}',
  weekly_goals_change_today int DEFAULT 0,
  monthly_goals_completed int DEFAULT 0,
  monthly_goals_percentage int DEFAULT 0,
  completed_monthly_goal_texts text[] DEFAULT '{}',
  monthly_goals_change_today int DEFAULT 0,
  weekly_missed_tasks jsonb DEFAULT '[]',
  gym_days_this_week int NOT NULL DEFAULT 0, -- rolling Mon->day snapshot, excludes rest days
  gym_days_possible int NOT NULL DEFAULT 1
);

-- Every action event: streaks, heatmap, week strip, lifetime counts.
CREATE TABLE oasis.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_type text NOT NULL,               -- 'task_completed' | 'goal_completed' | 'ai_chat_sent'
  activity_date date NOT NULL,               -- user-local date
  activity_count int DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- GYM
-- ============================================
-- Weekly working table: one row per user+day+week+year. WIPED by the
-- Monday reset — content persists via gym_memory. is_rest marks an
-- intentional rest day (workout_group 'Rest', excluded from all gym
-- counts, described to the LLM as planned recovery).
CREATE TABLE oasis.gym_workout_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_of_week text NOT NULL,
  workout_group text NOT NULL,
  notes text NOT NULL DEFAULT '',
  logged_date date NOT NULL DEFAULT CURRENT_DATE,
  week_number int NOT NULL,
  year int NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_rest boolean NOT NULL DEFAULT false
  -- UNIQUE (user_id, day_of_week, week_number, year)
);

-- THE permanent gym record. Active window: <=5 rows per workout name
-- (archived=false); overflow flips archived=true (Gym Archive screen),
-- never deleted. pinned (<=3 per group) never ages out but counts
-- toward the 5. Rest days and note-less days write no row here.
CREATE TABLE oasis.gym_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workout_group text NOT NULL,               -- normalized (trimmed, capitalized)
  notes text NOT NULL,
  session_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false
  -- UNIQUE (user_id, workout_group, session_date)
);

CREATE TABLE oasis.gym_prs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  muscle_group text NOT NULL,                -- Chest/Back/Legs/Shoulders/Arms
  exercise_name text NOT NULL,
  weight numeric NOT NULL,
  reps int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- REVIEWS / ACHIEVEMENTS / QUOTES / PUSH
-- ============================================
-- Cached Wrapped narrative per completed calendar year (stats are
-- recomputed live; only the LLM paragraph is stored).
CREATE TABLE oasis.yearly_reviews (
  user_id uuid NOT NULL,
  year int NOT NULL,
  narrative text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, year)
);

CREATE TABLE oasis.achievements (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  requirement_type text NOT NULL,
  requirement_value int NOT NULL,
  icon text,
  display_order int NOT NULL
);

CREATE TABLE oasis.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id text NOT NULL,
  unlocked_at timestamptz DEFAULT now()
);

CREATE TABLE oasis.quote_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quote_id int NOT NULL,
  interaction_type text NOT NULL,            -- 'like' | 'dislike' | 'none'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- View: oasis.quote_dislike_stats (aggregated dislikes per quote)

CREATE TABLE oasis.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oasis.notification_preferences (
  user_id uuid PRIMARY KEY,
  weekly_summary_enabled boolean NOT NULL DEFAULT true,
  inactivity_reminder_enabled boolean NOT NULL DEFAULT true,
  streak_at_risk_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- FUNCTIONS (oasis schema, live 2026-07-12)
-- ============================================
-- Resets:      reset_task_progress(), reset_goal_progress(goal_type),
--              run_weekly_reset(), run_monthly_reset(), run_yearly_reset()
-- Streaks:     get_current_streak(uuid), get_longest_streak(uuid),
--              get_task_streak, get_full_engagement_streak
-- Stats/etc:   get_heatmap_month, get_account_creation_date,
--              get_active_months_count, get_first_month_activity_days,
--              get_balanced_week_progress, get_triple_threat_status,
--              get_all_quote_like_counts, get_quote_like_count
