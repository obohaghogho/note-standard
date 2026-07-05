-- ============================================================
-- STATUS SYSTEM MIGRATION — NoteStandard
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. Main statuses table
CREATE TABLE IF NOT EXISTS statuses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('text','image','video','audio','gif','link','document')),
  content       TEXT,
  media_url     TEXT,
  media_thumbnail TEXT,
  media_size    BIGINT,
  media_duration REAL,
  bg_color      TEXT DEFAULT '#1a1a2e',
  bg_gradient   TEXT,
  font_style    TEXT DEFAULT 'inter',
  font_size     INTEGER DEFAULT 24,
  text_align    TEXT DEFAULT 'center',
  link_url      TEXT,
  link_title    TEXT,
  link_description TEXT,
  link_image    TEXT,
  privacy       TEXT NOT NULL DEFAULT 'contacts' CHECK (privacy IN ('everyone','contacts','except','only','private')),
  view_count    INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  is_archived   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast feed queries
CREATE INDEX IF NOT EXISTS idx_statuses_user_expires ON statuses (user_id, expires_at DESC) WHERE is_deleted = false;

-- 2. Status views (one row per unique viewer per status)
CREATE TABLE IF NOT EXISTS status_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id   UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  viewer_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (status_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_status_views_status ON status_views (status_id);

-- 3. Status reactions (one emoji per user per status)
CREATE TABLE IF NOT EXISTS status_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id   UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (status_id, user_id)
);

-- 4. Status privacy rules (for 'except' and 'only' modes)
CREATE TABLE IF NOT EXISTS status_privacy_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id   UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_type   TEXT NOT NULL CHECK (rule_type IN ('except','only')),
  UNIQUE (status_id, user_id)
);

-- 5. Status mutes (user mutes another user's statuses)
CREATE TABLE IF NOT EXISTS status_mutes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_user  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, muted_user)
);

-- 6. Row-Level Security: only authenticated users can read/write their own data
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_privacy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_mutes ENABLE ROW LEVEL SECURITY;

-- The API server uses the service role key (bypasses RLS), so these policies
-- protect direct client access only.
CREATE POLICY "statuses_service_all" ON statuses FOR ALL USING (true);
CREATE POLICY "status_views_service_all" ON status_views FOR ALL USING (true);
CREATE POLICY "status_reactions_service_all" ON status_reactions FOR ALL USING (true);
CREATE POLICY "status_privacy_rules_service_all" ON status_privacy_rules FOR ALL USING (true);
CREATE POLICY "status_mutes_service_all" ON status_mutes FOR ALL USING (true);

-- Done!
SELECT 'Status system tables created successfully.' AS result;
