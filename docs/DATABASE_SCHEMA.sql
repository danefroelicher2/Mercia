-- ============================================
-- MERCIA - DATABASE SCHEMA v1.0
-- ============================================
-- Run this in your Supabase SQL editor

-- Create schema for Mercia
CREATE SCHEMA IF NOT EXISTS oasis;

-- ============================================
-- 1. USERS (extends Supabase auth.users)
-- ============================================
CREATE TABLE oasis.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. DAILY QUESTIONS BANK
-- ============================================
CREATE TABLE oasis.daily_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('values', 'beliefs', 'goals', 'experiences', 'relationships', 'decision_making')),
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'deep')),
  tags TEXT[],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_questions_category ON oasis.daily_questions(category);
CREATE INDEX idx_questions_active ON oasis.daily_questions(active);

-- ============================================
-- 3. USER QUESTION RESPONSES
-- ============================================
CREATE TABLE oasis.user_question_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES oasis.daily_questions(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,

  -- AI-extracted structured insights (JSONB for flexibility)
  extracted_insights JSONB DEFAULT '{}'::jsonb,

  -- Tracking
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  skip_count INT DEFAULT 0,

  UNIQUE(user_id, question_id)
);

CREATE INDEX idx_user_responses_user ON oasis.user_question_responses(user_id);
CREATE INDEX idx_user_responses_answered ON oasis.user_question_responses(answered_at DESC);

-- ============================================
-- 4. USER MEMORY PROFILES
-- ============================================
CREATE TABLE oasis.user_memory_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core Identity — derived views rebuilt from insights_metadata
  core_values JSONB DEFAULT '[]'::jsonb,
  beliefs JSONB DEFAULT '{}'::jsonb,
  interests JSONB DEFAULT '{}'::jsonb,

  -- Communication Style
  communication_style JSONB DEFAULT '{}'::jsonb,

  -- Supporting Evidence
  supporting_quotes JSONB DEFAULT '[]'::jsonb,

  -- Dual-source insight store (InsightMetadataEntry[])
  insights_metadata JSONB DEFAULT '[]'::jsonb,

  -- Staging area for conversation insights awaiting commit threshold
  -- Same shape as InsightMetadataEntry; never exposed to clients.
  pending_insights JSONB DEFAULT '[]'::jsonb,

  -- Per-pool counts (maintained on every write for fast UI reads)
  question_facts_count INTEGER DEFAULT 0,
  conversation_facts_count INTEGER DEFAULT 0,

  -- Per-pool completeness: count / cap (0.0–1.0)
  question_facts_completeness FLOAT DEFAULT 0.0,
  conversation_facts_completeness FLOAT DEFAULT 0.0,

  -- Legacy completeness: average of the two above
  profile_completeness FLOAT DEFAULT 0.0 CHECK (profile_completeness >= 0 AND profile_completeness <= 1),

  questions_answered INT DEFAULT 0,
  chat_messages_analyzed INTEGER DEFAULT 0,
  chat_extractions_count INTEGER DEFAULT 0,
  total_interactions INT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_profiles_completeness ON oasis.user_memory_profiles(profile_completeness);

-- ============================================
-- 5. DAILY QUESTION TRACKING
-- ============================================
CREATE TABLE oasis.user_daily_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES oasis.daily_questions(id) ON DELETE CASCADE,

  assigned_date DATE NOT NULL,
  answered BOOLEAN DEFAULT FALSE,
  skipped_on DATE[],

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, assigned_date)
);

CREATE INDEX idx_daily_questions_user_date ON oasis.user_daily_questions(user_id, assigned_date DESC);

-- ============================================
-- 6. CHATS
-- ============================================
CREATE TABLE oasis.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chats_user ON oasis.chats(user_id);
CREATE INDEX idx_chats_updated ON oasis.chats(updated_at DESC);

-- ============================================
-- 7. CHAT MESSAGES
-- ============================================
CREATE TABLE oasis.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES oasis.chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_chat ON oasis.chat_messages(chat_id, created_at ASC);

-- ============================================
-- 8. HELPER FUNCTIONS
-- ============================================

-- Function: Get today's question for a user (EST timezone)
CREATE OR REPLACE FUNCTION oasis.get_daily_question_for_user(p_user_id UUID)
RETURNS TABLE (
  question_id UUID,
  question_text TEXT,
  category TEXT,
  assigned_date DATE,
  skip_count INT
) AS $$
DECLARE
  v_today DATE;
  v_existing_question_id UUID;
BEGIN
  -- Get today's date in EST
  v_today := (NOW() AT TIME ZONE 'America/New_York')::DATE;

  -- Check if user already has a question assigned for today
  SELECT udq.question_id INTO v_existing_question_id
  FROM oasis.user_daily_questions udq
  WHERE udq.user_id = p_user_id
    AND udq.assigned_date = v_today
    AND udq.answered = FALSE;

  -- If question exists for today, return it
  IF v_existing_question_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      dq.id,
      dq.question_text,
      dq.category,
      v_today,
      COALESCE(array_length((SELECT skipped_on FROM oasis.user_daily_questions WHERE user_id = p_user_id AND question_id = dq.id), 1), 0)
    FROM oasis.daily_questions dq
    WHERE dq.id = v_existing_question_id;
    RETURN;
  END IF;

  -- Otherwise, assign a new random question (not previously answered)
  RETURN QUERY
  WITH unanswered_questions AS (
    SELECT dq.id
    FROM oasis.daily_questions dq
    WHERE dq.active = true
      AND dq.id NOT IN (
        SELECT question_id
        FROM oasis.user_question_responses
        WHERE user_id = p_user_id
      )
    ORDER BY RANDOM()
    LIMIT 1
  )
  INSERT INTO oasis.user_daily_questions (user_id, question_id, assigned_date)
  SELECT p_user_id, uq.id, v_today
  FROM unanswered_questions uq
  RETURNING
    question_id,
    (SELECT question_text FROM oasis.daily_questions WHERE id = question_id),
    (SELECT category FROM oasis.daily_questions WHERE id = question_id),
    v_today,
    0;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE oasis.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE oasis.user_question_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE oasis.user_memory_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE oasis.user_daily_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE oasis.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE oasis.chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users access own profile" ON oasis.user_profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users access own responses" ON oasis.user_question_responses
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users access own memory" ON oasis.user_memory_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users access own daily questions" ON oasis.user_daily_questions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users access own chats" ON oasis.chats
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users access own messages" ON oasis.chat_messages
  FOR ALL USING (auth.uid() = user_id);

-- Daily questions are public (read-only)
ALTER TABLE oasis.daily_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active questions" ON oasis.daily_questions
  FOR SELECT USING (active = true);

-- ============================================
-- 10. SEED DATA - 10 Initial Questions
-- ============================================

INSERT INTO oasis.daily_questions (question_text, category, difficulty, tags) VALUES
  ('What childhood experience most shapes how you approach failure today?', 'experiences', 'deep', ARRAY['failure', 'childhood', 'resilience']),
  ('If you could change one widely accepted belief in society, what would it be and why?', 'beliefs', 'deep', ARRAY['society', 'beliefs', 'change']),
  ('What does success mean to you, independent of external validation?', 'values', 'medium', ARRAY['success', 'values', 'self-worth']),
  ('Describe a moment when you felt most authentically yourself.', 'experiences', 'medium', ARRAY['authenticity', 'self-awareness']),
  ('What legacy do you want to leave behind?', 'goals', 'deep', ARRAY['legacy', 'purpose', 'impact']),
  ('If you could master any skill instantly, what would it be and why?', 'goals', 'easy', ARRAY['skills', 'aspirations']),
  ('What relationship in your life has taught you the most about yourself?', 'relationships', 'medium', ARRAY['relationships', 'growth', 'self-discovery']),
  ('When do you feel most at peace?', 'experiences', 'easy', ARRAY['peace', 'contentment', 'mindfulness']),
  ('What principle or value would you never compromise on?', 'values', 'medium', ARRAY['principles', 'integrity', 'boundaries']),
  ('How do you make important decisions - logic, intuition, or both?', 'decision_making', 'medium', ARRAY['decision-making', 'process', 'thinking']);

-- ============================================
-- DONE!
-- ============================================

SELECT 'Mercia database schema created successfully!' as status;
