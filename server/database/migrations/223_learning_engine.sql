-- Migration: Phase 3 — Intelligent Learning Platform
-- Flashcards, Quizzes, Summaries, Learning Sessions, Achievements

-- ============================================================
-- 1. FLASHCARDS
-- Each card is linked to a source knowledge node
-- ============================================================
CREATE TABLE IF NOT EXISTS flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid REFERENCES community_spaces(id) ON DELETE CASCADE,
  path_node_id uuid REFERENCES learning_path_nodes(id) ON DELETE SET NULL,
  source_node_id uuid NOT NULL,
  source_node_type text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,

  front text NOT NULL,      -- Question / Prompt
  back text NOT NULL,       -- Answer / Explanation
  hint text,
  difficulty text DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tags text[] DEFAULT '{}',

  is_ai_generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_space ON flashcards(space_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_source ON flashcards(source_node_id, source_node_type);

-- ============================================================
-- 2. QUIZZES
-- ============================================================
CREATE TABLE IF NOT EXISTS quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid REFERENCES community_spaces(id) ON DELETE CASCADE,
  path_node_id uuid REFERENCES learning_path_nodes(id) ON DELETE SET NULL,
  source_node_id uuid,
  source_node_type text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,

  title text NOT NULL,
  description text,
  time_limit_seconds integer,      -- NULL = unlimited
  pass_percentage numeric DEFAULT 70,
  is_ai_generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid REFERENCES quizzes(id) ON DELETE CASCADE,

  question text NOT NULL,
  question_type text DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
  options jsonb,          -- [{id, text, is_correct}]
  correct_answer text,    -- For short_answer type
  explanation text,       -- Shown after answering
  order_index integer DEFAULT 0,
  points integer DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, order_index);

-- ============================================================
-- 3. SUMMARIES
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id uuid NOT NULL,
  source_node_type text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,

  content text NOT NULL,
  complexity_level text DEFAULT 'standard' CHECK (complexity_level IN ('simple', 'standard', 'technical')),
  is_ai_generated boolean DEFAULT false,
  upvotes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),

  UNIQUE(source_node_id, source_node_type, complexity_level)
);

-- ============================================================
-- 4. UNIFIED LEARNING SESSIONS
-- One row per item reviewed. Tracks SM-2 spaced repetition state.
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,

  -- What was studied
  node_id uuid NOT NULL,
  node_type text NOT NULL CHECK (node_type IN ('flashcard', 'quiz', 'summary', 'wiki', 'post')),

  -- SM-2 spaced repetition fields
  ease_factor numeric DEFAULT 2.5,
  interval_days integer DEFAULT 1,
  next_review_at timestamptz DEFAULT now() + interval '1 day',
  success_streak integer DEFAULT 0,

  -- Session quality metrics
  quality integer CHECK (quality BETWEEN 0 AND 5),  -- SM-2: 0=blackout, 5=perfect
  accuracy numeric,          -- Percentage correct (for quizzes)
  time_spent_seconds integer,
  review_count integer DEFAULT 1,

  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,

  UNIQUE(user_id, node_id, node_type)  -- One record per user/node pair, updated on review
);

CREATE INDEX IF NOT EXISTS idx_lsession_user ON learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lsession_due ON learning_sessions(user_id, next_review_at)
  WHERE next_review_at IS NOT NULL;

-- ============================================================
-- 5. USER GOALS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_learning_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  space_id uuid REFERENCES community_spaces(id) ON DELETE CASCADE,

  goal_type text NOT NULL CHECK (goal_type IN ('interview_prep', 'certification', 'casual', 'deep_study')),
  available_minutes_per_day integer DEFAULT 15,
  target_completion_date date,
  is_active boolean DEFAULT true,

  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 6. STUDY STREAKS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_study_streaks (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_streak_days integer DEFAULT 0,
  longest_streak_days integer DEFAULT 0,
  last_study_date date,
  total_cards_reviewed integer DEFAULT 0,
  total_study_minutes integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 7. ACHIEVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS achievements (
  id text PRIMARY KEY,         -- e.g., 'first_lesson', 'streak_30'
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('learning', 'community', 'knowledge')),
  icon text NOT NULL,          -- Emoji or icon identifier
  points integer DEFAULT 10,
  is_secret boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id text REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- Seed core achievements
INSERT INTO achievements (id, title, description, category, icon, points) VALUES
  -- Learning
  ('first_lesson',        'First Lesson',          'Completed your first learning path node',      'learning',   '🎯', 10),
  ('first_quiz',          'Quiz Passed',            'Passed your first quiz',                       'learning',   '✅', 15),
  ('path_complete',       'Path Completed',         'Finished an entire learning path',             'learning',   '🏁', 50),
  ('streak_7',            '7-Day Streak',           'Studied 7 days in a row',                      'learning',   '🔥', 25),
  ('streak_30',           '30-Day Streak',          'Studied 30 days in a row',                     'learning',   '🌟', 100),
  ('cards_reviewed_100',  'Card Master',            'Reviewed 100 flashcards',                      'learning',   '🃏', 30),
  -- Community
  ('first_answer',        'First Answer',           'Answered an unanswered question',              'community',  '💬', 20),
  ('mentor_badge',        'Mentor',                 'Received Mentor recognition',                  'community',  '🎓', 75),
  ('expert_badge',        'Expert',                 'Received Expert recognition',                  'community',  '🏆', 75),
  -- Knowledge
  ('first_wiki',          'Wiki Contributor',       'Contributed to a Space Wiki',                  'knowledge',  '📖', 25),
  ('saves_100',           'Knowledge Curator',      'Saved 100 posts or resources',                 'knowledge',  '📌', 40),
  ('top_guide',           'Guide Creator',          'Created a guide with 500+ saves',              'knowledge',  '🌐', 60)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. RLS
-- ============================================================
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public flashcards readable" ON flashcards FOR SELECT USING (true);
CREATE POLICY "Space mods can manage flashcards" ON flashcards FOR ALL USING (
  EXISTS (SELECT 1 FROM space_members WHERE space_id = flashcards.space_id AND user_id = auth.uid() AND permission_role IN ('owner', 'admin', 'moderator'))
);

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public quizzes readable" ON quizzes FOR SELECT USING (true);

ALTER TABLE knowledge_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Summaries are public" ON knowledge_summaries FOR SELECT USING (true);

ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sessions" ON learning_sessions FOR ALL USING (user_id = auth.uid());

ALTER TABLE user_learning_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own goals" ON user_learning_goals FOR ALL USING (user_id = auth.uid());

ALTER TABLE user_study_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own streak" ON user_study_streaks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service manages streaks" ON user_study_streaks FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Achievements are public" ON user_achievements FOR SELECT USING (true);
CREATE POLICY "Service grants achievements" ON user_achievements FOR INSERT WITH CHECK (auth.role() = 'service_role');
