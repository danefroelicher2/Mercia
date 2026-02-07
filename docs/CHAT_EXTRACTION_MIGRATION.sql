-- IMPORTANT: Run this in Supabase SQL Editor before deploying extraction system
-- Creates tables to track extraction history and batch job logs

-- ============================================
-- CHAT EXTRACTION SYSTEM - DATABASE SCHEMAa
-- ============================================

-- Add chat extraction tracking to memory profiles
-- (chat_messages_analyzed and chat_extractions_count already exist from previous migration)

-- Create table to track extraction history
CREATE TABLE IF NOT EXISTS oasis.chat_extraction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES oasis.chats(id) ON DELETE CASCADE,

  -- What was extracted
  insights_extracted JSONB DEFAULT '{}'::jsonb,  -- The actual insights found
  quality_score FLOAT,                           -- 0.0-1.0 from quality check

  -- Metadata
  extraction_date DATE NOT NULL,
  message_count INTEGER,
  processing_time_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate extractions
  UNIQUE(chat_id, extraction_date)
);

CREATE INDEX idx_extraction_history_user ON oasis.chat_extraction_history(user_id, extraction_date DESC);
CREATE INDEX idx_extraction_history_date ON oasis.chat_extraction_history(extraction_date DESC);

-- Add RLS policy
ALTER TABLE oasis.chat_extraction_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own extraction history" ON oasis.chat_extraction_history
  FOR ALL USING (auth.uid() = user_id);

-- Create table for batch job tracking
CREATE TABLE IF NOT EXISTS oasis.extraction_job_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_date DATE NOT NULL UNIQUE,

  -- Stats
  users_processed INTEGER DEFAULT 0,
  chats_analyzed INTEGER DEFAULT 0,
  insights_extracted INTEGER DEFAULT 0,

  -- Performance
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Status
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT
);

CREATE INDEX idx_job_log_date ON oasis.extraction_job_log(job_date DESC);

-- Add semantic_importance field to memory profile for weighted scoring
ALTER TABLE oasis.user_memory_profiles
ADD COLUMN IF NOT EXISTS insights_metadata JSONB DEFAULT '[]'::jsonb;
-- This will store array of insight objects with scoring data
