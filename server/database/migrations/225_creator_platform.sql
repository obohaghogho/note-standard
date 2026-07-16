-- Migration: Phase 4A — Creator Platform
-- Analytics snapshots, content insights, certificates, drafts, revenue readiness.

-- ============================================================
-- 1. CREATOR CONTENT DRAFTS
-- Unified draft management for all content types.
-- ============================================================
CREATE TABLE IF NOT EXISTS creator_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  space_id uuid REFERENCES community_spaces(id) ON DELETE SET NULL,

  content_type text NOT NULL CHECK (content_type IN (
    'post', 'wiki', 'learning_path', 'flashcard', 'quiz', 'collection', 'template'
  )),
  title text,
  content_payload jsonb DEFAULT '{}',   -- Full draft content in structured form
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'needs_review', 'outdated', 'scheduled')),
  scheduled_publish_at timestamptz,

  -- Autosave support
  last_autosaved_at timestamptz DEFAULT now(),
  autosave_hash text,                   -- Hash of last autosaved payload (for change detection)

  -- Version history (simple append-only)
  version integer DEFAULT 1,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_draft_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES creator_drafts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content_payload jsonb NOT NULL,
  saved_by uuid REFERENCES profiles(id),
  saved_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drafts_creator ON creator_drafts(creator_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_scheduled ON creator_drafts(scheduled_publish_at)
  WHERE status = 'scheduled' AND scheduled_publish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_draft_versions ON creator_draft_versions(draft_id, version);

-- ============================================================
-- 2. CREATOR ANALYTICS SNAPSHOTS
-- Precomputed daily stats per creator (avoids expensive live aggregation).
-- ============================================================
CREATE TABLE IF NOT EXISTS creator_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,

  -- Reach
  total_views integer DEFAULT 0,
  unique_readers integer DEFAULT 0,
  followers_gained integer DEFAULT 0,
  space_member_growth integer DEFAULT 0,

  -- Engagement
  total_saves integer DEFAULT 0,
  total_shares integer DEFAULT 0,
  total_comments integer DEFAULT 0,
  read_completion_pct numeric DEFAULT 0,    -- Average completion across all content
  avg_reading_time_seconds integer DEFAULT 0,

  -- Learning
  quiz_completions integer DEFAULT 0,
  avg_quiz_score numeric DEFAULT 0,
  flashcard_completions integer DEFAULT 0,
  learning_path_completions integer DEFAULT 0,
  retention_7d_pct numeric DEFAULT 0,       -- % of learners who returned after 7 days
  retention_30d_pct numeric DEFAULT 0,

  -- AI
  ai_tutor_sessions integer DEFAULT 0,
  top_ai_questions jsonb DEFAULT '[]',       -- [{question, count}]

  UNIQUE(creator_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_creator_snapshots ON creator_analytics_snapshots(creator_id, snapshot_date DESC);

-- ============================================================
-- 3. CONTENT INSIGHTS
-- Per-node behavioral signals (drop-off, missed questions, search gaps).
-- ============================================================
CREATE TABLE IF NOT EXISTS content_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL,
  node_type text NOT NULL,
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,

  -- Reader behavior
  avg_completion_pct numeric DEFAULT 0,
  avg_read_time_seconds integer DEFAULT 0,
  drop_off_pct numeric DEFAULT 0,          -- % of readers who didn't finish
  peak_drop_off_position integer,          -- Character/token position where most readers stop

  -- Quiz signals
  most_missed_question_ids uuid[] DEFAULT '{}',
  avg_quiz_accuracy numeric DEFAULT 0,

  -- Search signals (topics frequently searched but missing from this content)
  related_search_gaps text[] DEFAULT '{}',

  -- AI signals
  concepts_users_struggle_with text[] DEFAULT '{}',
  ai_question_count integer DEFAULT 0,

  updated_at timestamptz DEFAULT now(),

  UNIQUE(node_id, node_type)
);

CREATE INDEX IF NOT EXISTS idx_content_insights_creator ON content_insights(creator_id);
CREATE INDEX IF NOT EXISTS idx_content_insights_node ON content_insights(node_id, node_type);

-- ============================================================
-- 4. CERTIFICATES
-- Issued on meaningful Learning Path + Assessment completion.
-- ============================================================
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),

  -- Recipient
  learner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  learner_name text NOT NULL,

  -- What was completed
  path_id uuid REFERENCES learning_paths(id) ON DELETE SET NULL,
  path_title text NOT NULL,
  space_id uuid REFERENCES community_spaces(id) ON DELETE SET NULL,
  space_name text NOT NULL,

  -- Issuer
  creator_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  creator_name text NOT NULL,

  -- Completion evidence
  completion_pct numeric NOT NULL,
  final_quiz_score numeric,
  time_spent_minutes integer,

  -- Issuance
  issued_at timestamptz DEFAULT now(),
  expires_at timestamptz,                  -- NULL = no expiry
  is_revoked boolean DEFAULT false,
  revoke_reason text,

  -- Verification
  verification_url text GENERATED ALWAYS AS (
    'https://notestandard.app/verify/' || certificate_token
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_certs_learner ON certificates(learner_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_certs_token ON certificates(certificate_token);
CREATE INDEX IF NOT EXISTS idx_certs_path ON certificates(path_id);

-- ============================================================
-- 5. REVENUE READINESS SCORES
-- Snapshot of a creator's readiness to monetize (internal metric).
-- ============================================================
CREATE TABLE IF NOT EXISTS creator_revenue_readiness (
  creator_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- Score components (each 0–100)
  active_learners_score numeric DEFAULT 0,
  completion_rate_score numeric DEFAULT 0,
  content_quality_score numeric DEFAULT 0,  -- Based on avg quiz scores + ratings
  ai_engagement_score numeric DEFAULT 0,
  publishing_consistency_score numeric DEFAULT 0,
  community_trust_score numeric DEFAULT 0,

  -- Composite score (weighted average)
  overall_score numeric GENERATED ALWAYS AS (
    ROUND(
      (active_learners_score * 0.25 +
       completion_rate_score * 0.25 +
       content_quality_score * 0.20 +
       ai_engagement_score * 0.10 +
       publishing_consistency_score * 0.10 +
       community_trust_score * 0.10)::numeric, 1
    )
  ) STORED,

  -- Threshold: 70+ = eligible for Creator Economy features
  is_monetization_eligible boolean GENERATED ALWAYS AS (
    (active_learners_score * 0.25 +
     completion_rate_score * 0.25 +
     content_quality_score * 0.20 +
     ai_engagement_score * 0.10 +
     publishing_consistency_score * 0.10 +
     community_trust_score * 0.10) >= 70
  ) STORED,

  calculated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 6. NORTH STAR METRICS VIEW
-- Platform-level KPIs computed from existing data.
-- ============================================================
CREATE OR REPLACE VIEW platform_north_star_metrics AS
SELECT
  -- Monthly Active Learners (completed ≥1 session this month)
  COUNT(DISTINCT ls.user_id) FILTER (
    WHERE ls.completed_at >= date_trunc('month', now())
  ) AS monthly_active_learners,

  -- Avg path completion rate
  ROUND(AVG(upc.completion_pct), 1) AS avg_path_completion_pct,

  -- Avg weekly study minutes
  ROUND(AVG(uss.total_study_minutes / NULLIF(
    EXTRACT(WEEK FROM now()) - EXTRACT(WEEK FROM uss.updated_at) + 1, 0
  )), 0) AS avg_weekly_study_minutes,

  -- 30-day learner retention (returned at least once)
  COUNT(DISTINCT ls2.user_id) * 100.0
    / NULLIF(COUNT(DISTINCT ls.user_id), 0) AS retention_30d_pct

FROM learning_sessions ls
LEFT JOIN user_path_completion upc ON upc.user_id = ls.user_id
LEFT JOIN user_study_streaks uss ON uss.user_id = ls.user_id
LEFT JOIN learning_sessions ls2
  ON ls2.user_id = ls.user_id
  AND ls2.completed_at >= now() - interval '30 days'
  AND ls2.completed_at < now();

-- ============================================================
-- 7. RLS
-- ============================================================
ALTER TABLE creator_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage own drafts" ON creator_drafts FOR ALL USING (creator_id = auth.uid());

ALTER TABLE creator_draft_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators view own draft versions" ON creator_draft_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM creator_drafts WHERE id = draft_id AND creator_id = auth.uid())
);

ALTER TABLE creator_analytics_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators view own snapshots" ON creator_analytics_snapshots FOR SELECT USING (creator_id = auth.uid());
CREATE POLICY "Service writes snapshots" ON creator_analytics_snapshots FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE content_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators view own content insights" ON content_insights FOR SELECT USING (creator_id = auth.uid());
CREATE POLICY "Service writes insights" ON content_insights FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Certificates are publicly readable" ON certificates FOR SELECT USING (true);
CREATE POLICY "Service issues certificates" ON certificates FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Learners view own certs" ON certificates FOR SELECT USING (learner_id = auth.uid());

ALTER TABLE creator_revenue_readiness ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators view own readiness" ON creator_revenue_readiness FOR SELECT USING (creator_id = auth.uid());
CREATE POLICY "Service updates readiness" ON creator_revenue_readiness FOR ALL USING (auth.role() = 'service_role');
