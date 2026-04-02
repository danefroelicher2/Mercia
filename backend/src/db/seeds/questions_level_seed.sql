-- Migration: Add 8-level question difficulty system columns
-- Applied: 2026-04-01
-- Project: eooenwleghhzrzgkagjp (Supabase)
-- Prerequisites: oasis.daily_questions and oasis.user_memory_profiles tables must exist

BEGIN;

-- Add level column to daily_questions
ALTER TABLE oasis.daily_questions
  ADD COLUMN IF NOT EXISTS level INTEGER;

-- Set all existing questions to level 1
UPDATE oasis.daily_questions SET level = 1 WHERE level IS NULL;

-- Make level NOT NULL now that all rows have a value
ALTER TABLE oasis.daily_questions
  ALTER COLUMN level SET NOT NULL;

-- NOTE: CHECK constraint below was not applied in the live migration
-- ALTER TABLE oasis.daily_questions
--   ADD CONSTRAINT daily_questions_level_check CHECK (level BETWEEN 1 AND 8);

-- Index for level-filtered queries
CREATE INDEX IF NOT EXISTS idx_questions_level ON oasis.daily_questions(level);

-- Add question_level to user_memory_profiles
ALTER TABLE oasis.user_memory_profiles
  ADD COLUMN IF NOT EXISTS question_level INTEGER NOT NULL DEFAULT 1;

COMMIT;
