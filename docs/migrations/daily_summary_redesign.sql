-- ============================================
-- Daily Summary Redesign Migration
-- Run in Supabase SQL editor (oasis schema)
-- ============================================

ALTER TABLE oasis.weekly_summaries
  ADD COLUMN IF NOT EXISTS overall_percentage          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yesterday_overall_percentage INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_weekly_goal_texts  TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS weekly_goals_change_today    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_goals_completed      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_goals_percentage     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_monthly_goal_texts TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS monthly_goals_change_today   INTEGER DEFAULT 0;
