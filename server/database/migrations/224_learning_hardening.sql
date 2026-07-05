-- Migration: Phase 3.1 — Learning Engine Hardening
-- Adds AI confidence metadata, artifact versioning, dynamic difficulty calibration,
-- and the Practice Mode session schema.

-- ============================================================
-- 1. ARTIFACT VERSIONING & CONFIDENCE METADATA
-- Applied to flashcards, quizzes, and knowledge_summaries.
-- ============================================================

-- Flashcard versioning
ALTER TABLE flashcards
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS source_version integer DEFAULT 1,  -- Tracks which version of the source node this was generated from
ADD COLUMN IF NOT EXISTS is_outdated boolean DEFAULT false,  -- Flagged when source node changes
ADD COLUMN IF NOT EXISTS ai_metadata jsonb DEFAULT '{
  "model": null,
  "generated_at": null,
  "confidence": null,
  "human_reviewed": false,
  "source_node_ids": [],
  "generation_version": 1
}'::jsonb;

-- Quiz versioning
ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS source_version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_outdated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_metadata jsonb DEFAULT '{
  "model": null,
  "generated_at": null,
  "confidence": null,
  "human_reviewed": false,
  "source_node_ids": [],
  "generation_version": 1
}'::jsonb;

-- Summary versioning
ALTER TABLE knowledge_summaries
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS source_version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_outdated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_metadata jsonb DEFAULT '{
  "model": null,
  "generated_at": null,
  "confidence": null,
  "human_reviewed": false,
  "source_node_ids": [],
  "generation_version": 1
}'::jsonb;

-- ============================================================
-- 2. DYNAMIC DIFFICULTY CALIBRATION
-- Replaces the fixed 'easy/medium/hard' label with an evolving score.
-- ============================================================
ALTER TABLE flashcards
ADD COLUMN IF NOT EXISTS calibrated_difficulty numeric DEFAULT 0.5
  CHECK (calibrated_difficulty BETWEEN 0 AND 1), -- 0 = trivial, 1 = extremely hard
ADD COLUMN IF NOT EXISTS difficulty_sample_count integer DEFAULT 0; -- Number of reviews used to calibrate

-- Function: update calibrated difficulty after a user review
CREATE OR REPLACE FUNCTION update_flashcard_difficulty(
  p_card_id uuid,
  p_quality integer,  -- SM-2 quality 0–5
  p_time_seconds integer
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  current_diff numeric;
  current_count integer;
  new_diff numeric;
  -- Normalize quality: 0 = hardest (quality 0), 1 = easiest (quality 5)
  quality_factor numeric := 1.0 - (p_quality::numeric / 5.0);
  -- Time factor: over 30s on a card = harder than average
  time_factor numeric := LEAST(p_time_seconds::numeric / 30.0, 1.0);
  combined numeric;
BEGIN
  SELECT calibrated_difficulty, difficulty_sample_count
  INTO current_diff, current_count
  FROM flashcards WHERE id = p_card_id;

  combined := (quality_factor * 0.6) + (time_factor * 0.4);
  -- Exponential moving average weighted toward new evidence
  new_diff := (current_diff * current_count + combined) / (current_count + 1);

  UPDATE flashcards
  SET calibrated_difficulty = ROUND(new_diff::numeric, 3),
      difficulty_sample_count = current_count + 1
  WHERE id = p_card_id;
END;
$$;

-- ============================================================
-- 3. SOURCE NODE CHANGE TRACKING
-- When a source node (wiki page, post) is updated, flag
-- all dependent artifacts for regeneration.
-- ============================================================
CREATE TABLE IF NOT EXISTS artifact_regen_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id uuid NOT NULL,
  source_node_type text NOT NULL,
  artifact_type text NOT NULL CHECK (artifact_type IN ('flashcard', 'quiz', 'summary')),
  artifact_count integer DEFAULT 0,   -- How many artifacts need regen
  reason text,
  queued_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_regen_queue_source ON artifact_regen_queue(source_node_id, source_node_type)
  WHERE processed_at IS NULL;

-- Trigger function: when a wiki page or community post is updated,
-- enqueue all dependent artifacts for regeneration.
CREATE OR REPLACE FUNCTION enqueue_artifact_regen()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only trigger on content changes, not metadata updates
  IF OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO artifact_regen_queue (source_node_id, source_node_type, artifact_type, reason)
    VALUES
      (NEW.id, TG_TABLE_NAME::text, 'flashcard', 'Source content changed'),
      (NEW.id, TG_TABLE_NAME::text, 'quiz',      'Source content changed'),
      (NEW.id, TG_TABLE_NAME::text, 'summary',   'Source content changed');

    -- Flag existing artifacts as outdated
    UPDATE flashcards SET is_outdated = true WHERE source_node_id = NEW.id;
    UPDATE quizzes      SET is_outdated = true WHERE source_node_id = NEW.id;
    UPDATE knowledge_summaries SET is_outdated = true
      WHERE source_node_id = NEW.id AND source_node_type = TG_TABLE_NAME::text;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER wiki_page_regen_trigger
AFTER UPDATE ON space_wiki_pages
FOR EACH ROW EXECUTE FUNCTION enqueue_artifact_regen();

CREATE TRIGGER post_regen_trigger
AFTER UPDATE ON community_posts
FOR EACH ROW EXECUTE FUNCTION enqueue_artifact_regen();

-- ============================================================
-- 4. PRACTICE MODE SESSIONS
-- Mixed review from multiple paths, spaces, and weak areas.
-- ============================================================
CREATE TABLE IF NOT EXISTS practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,

  -- Session composition
  space_ids uuid[] DEFAULT '{}',   -- Which spaces were included
  path_ids uuid[] DEFAULT '{}',    -- Which learning paths
  session_type text DEFAULT 'mixed' CHECK (session_type IN (
    'mixed',        -- Multiple paths + weak areas
    'due_only',     -- Only cards due for review
    'weak_focus',   -- Prioritize low-accuracy topics
    'new_only'      -- Only unseen cards
  )),

  -- Composition metadata
  total_cards integer DEFAULT 0,
  completed_cards integer DEFAULT 0,
  accuracy_pct numeric,

  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions(user_id, started_at DESC);

-- ============================================================
-- 5. EXTENDED LEARNING ANALYTICS VIEW
-- Unified view for learner and creator analytics.
-- ============================================================
CREATE OR REPLACE VIEW learner_analytics AS
SELECT
  ls.user_id,
  COUNT(DISTINCT ls.node_id)                                  AS total_nodes_reviewed,
  COUNT(ls.id) FILTER (WHERE ls.quality >= 4)                AS strong_recalls,
  COUNT(ls.id) FILTER (WHERE ls.quality < 3)                 AS failed_recalls,
  ROUND(AVG(ls.quality), 2)                                  AS avg_quality,
  ROUND(
    COUNT(ls.id) FILTER (WHERE ls.quality >= 4) * 100.0
    / NULLIF(COUNT(ls.id), 0), 1
  )                                                          AS retention_pct,
  ROUND(AVG(ls.time_spent_seconds), 0)                       AS avg_session_seconds,
  COUNT(DISTINCT DATE(ls.completed_at))                      AS active_study_days,
  uss.current_streak_days,
  uss.total_study_minutes
FROM learning_sessions ls
LEFT JOIN user_study_streaks uss ON uss.user_id = ls.user_id
WHERE ls.completed_at IS NOT NULL
GROUP BY ls.user_id, uss.current_streak_days, uss.total_study_minutes;

-- ============================================================
-- 6. RLS for new tables
-- ============================================================
ALTER TABLE artifact_regen_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages regen queue" ON artifact_regen_queue FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own practice sessions" ON practice_sessions FOR ALL USING (user_id = auth.uid());
