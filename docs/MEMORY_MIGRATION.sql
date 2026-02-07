-- IMPORTANT: Run this SQL in Supabase SQL Editor before using the new completeness calculation
-- This adds placeholder columns for future chat extraction feature (Phase 2B)

-- Add new tracking columns for memory completeness
ALTER TABLE oasis.user_memory_profiles
ADD COLUMN IF NOT EXISTS chat_messages_analyzed INTEGER DEFAULT 0;

ALTER TABLE oasis.user_memory_profiles
ADD COLUMN IF NOT EXISTS chat_extractions_count INTEGER DEFAULT 0;

-- Update any existing profiles to have these values
UPDATE oasis.user_memory_profiles
SET chat_messages_analyzed = 0,
    chat_extractions_count = 0
WHERE chat_messages_analyzed IS NULL
   OR chat_extractions_count IS NULL;
