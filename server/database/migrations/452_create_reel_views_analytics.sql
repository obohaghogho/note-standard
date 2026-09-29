-- Migration 452: Create Reel Views Analytics Infrastructure
-- Hybrid architecture: Immutable event logs + Atomic counter on community_posts

CREATE TABLE IF NOT EXISTS reel_view_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  anon_session_id TEXT,
  session_bucket DATE NOT NULL DEFAULT CURRENT_DATE,
  watch_duration_seconds NUMERIC(6,2) DEFAULT 0.00,
  is_muted BOOLEAN DEFAULT TRUE,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_viewer_identity CHECK (viewer_id IS NOT NULL OR (anon_session_id IS NOT NULL AND anon_session_id <> ''))
);

-- Unique indexes for robust deduplication per viewer per reel per date bucket
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_auth_reel_view 
  ON reel_view_events(reel_id, viewer_id, session_bucket) 
  WHERE viewer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_anon_reel_view 
  ON reel_view_events(reel_id, anon_session_id, session_bucket) 
  WHERE anon_session_id IS NOT NULL AND anon_session_id <> '';

-- Performance Query Indexes
CREATE INDEX IF NOT EXISTS idx_reel_views_reel_bucket ON reel_view_events(reel_id, session_bucket);
CREATE INDEX IF NOT EXISTS idx_reel_views_viewer ON reel_view_events(viewer_id) WHERE viewer_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE reel_view_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read view events for author" ON reel_view_events;
DROP POLICY IF EXISTS "Authenticated users can insert own view events" ON reel_view_events;

CREATE POLICY "Public read view events for author" 
  ON reel_view_events FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM community_posts 
      WHERE community_posts.id = reel_view_events.reel_id 
        AND community_posts.author_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert own view events" 
  ON reel_view_events FOR INSERT 
  WITH CHECK (viewer_id = auth.uid() OR viewer_id IS NULL);


-- Stored Procedure for Atomic View Recording & Counter Increment
CREATE OR REPLACE FUNCTION record_reel_view(
  p_reel_id UUID,
  p_viewer_id UUID,
  p_anon_session_id TEXT,
  p_watch_duration NUMERIC DEFAULT 2.0,
  p_is_muted BOOLEAN DEFAULT TRUE,
  p_completed BOOLEAN DEFAULT FALSE
) RETURNS TABLE (inserted BOOLEAN, views_count INTEGER) AS $$
DECLARE
  v_inserted BOOLEAN := FALSE;
  v_current_views INTEGER := 0;
  v_author_id UUID := NULL;
  v_bucket DATE := CURRENT_DATE;
  v_safe_duration NUMERIC(6,2);
  v_rows_affected INTEGER := 0;
BEGIN
  -- 1. Validate Reel existence & extract author
  SELECT community_posts.author_id, COALESCE(community_posts.views_count, 0)
    INTO v_author_id, v_current_views
    FROM community_posts
   WHERE community_posts.id = p_reel_id;

  IF v_author_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  -- 2. Self-View Protection Rule: Authors viewing their own Reel DO NOT increment public views_count
  IF p_viewer_id IS NOT NULL AND v_author_id = p_viewer_id THEN
    RETURN QUERY SELECT FALSE, v_current_views;
    RETURN;
  END IF;

  -- Clamp watch duration to safe limits (0.0 to 600.0 seconds)
  v_safe_duration := GREATEST(0.0, LEAST(COALESCE(p_watch_duration, 2.0), 600.0));

  -- 3. Idempotent Insert attempt into reel_view_events
  IF p_viewer_id IS NOT NULL THEN
    INSERT INTO reel_view_events (reel_id, viewer_id, session_bucket, watch_duration_seconds, is_muted, completed)
    VALUES (p_reel_id, p_viewer_id, v_bucket, v_safe_duration, COALESCE(p_is_muted, true), COALESCE(p_completed, false))
    ON CONFLICT (reel_id, viewer_id, session_bucket) WHERE viewer_id IS NOT NULL DO NOTHING;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected > 0 THEN
      v_inserted := TRUE;
    END IF;
  ELSIF p_anon_session_id IS NOT NULL AND p_anon_session_id <> '' THEN
    INSERT INTO reel_view_events (reel_id, anon_session_id, session_bucket, watch_duration_seconds, is_muted, completed)
    VALUES (p_reel_id, p_anon_session_id, v_bucket, v_safe_duration, COALESCE(p_is_muted, true), COALESCE(p_completed, false))
    ON CONFLICT (reel_id, anon_session_id, session_bucket) WHERE anon_session_id IS NOT NULL AND anon_session_id <> '' DO NOTHING;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected > 0 THEN
      v_inserted := TRUE;
    END IF;
  END IF;

  -- 4. Atomic Counter Increment ONLY if a new qualified view event row was inserted
  IF v_inserted THEN
    UPDATE community_posts
       SET views_count = COALESCE(community_posts.views_count, 0) + 1
     WHERE community_posts.id = p_reel_id
    RETURNING community_posts.views_count INTO v_current_views;
  END IF;

  RETURN QUERY SELECT v_inserted, COALESCE(v_current_views, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

