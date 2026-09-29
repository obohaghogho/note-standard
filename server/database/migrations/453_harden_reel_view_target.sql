-- Migration 453: Harden Reel View Target Validation in record_reel_view
-- Enforces database-level invariant: View recording & views_count increment strictly restricted to Reel posts

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
  -- 1. Validate Reel post existence & extract author ONLY for valid Reel posts
  -- Canonical Reel check: is_reel = true OR post_type IN ('reel', 'video') OR category = 'reel'
  SELECT community_posts.author_id, COALESCE(community_posts.views_count, 0)
    INTO v_author_id, v_current_views
    FROM community_posts
   WHERE community_posts.id = p_reel_id
     AND (
       COALESCE(community_posts.is_reel, false) = true 
       OR community_posts.post_type IN ('reel', 'video') 
       OR community_posts.category = 'reel'
     );

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

  -- 3. Idempotent Insert attempt into reel_view_events (Calendar-day deduplication via session_bucket)
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
