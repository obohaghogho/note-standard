-- ==========================================
-- 041_OPTIMIZE_RLS_AND_PERFORMANCE.SQL
-- ==========================================

BEGIN;

-- 1. ADS SCHEMA ALIGNMENT (Integrated from previous plan)
-- ==========================================
ALTER TABLE ads ADD COLUMN IF NOT EXISTS destination_url TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ DEFAULT now();
ALTER TABLE ads ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

-- Migrate existing data
UPDATE ads SET destination_url = link_url WHERE destination_url IS NULL AND link_url IS NOT NULL;
UPDATE ads SET media_url = image_url WHERE media_url IS NULL AND image_url IS NOT NULL;

-- 2. BREAK PROFILES RECURSION
-- ==========================================
-- Problem: Many policies call is_admin() which queries profiles, causing recursion.
-- Fix: Simplify profiles RLS to minimum required for safe operation.

DROP POLICY IF EXISTS "profiles_select_public" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;

CREATE POLICY "profiles_select_public" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 3. DEFINITIVE NOTES RECURSION BREAK
-- ==========================================
-- Ensure helper functions are robust
CREATE OR REPLACE FUNCTION check_is_note_shared_definitive(p_note_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM shared_notes 
    WHERE note_id = p_note_id 
    AND (
      shared_by = p_user_id
      OR team_id IN (SELECT team_id FROM team_members WHERE user_id = p_user_id)
    )
  );
$$;

DROP POLICY IF EXISTS "notes_select_policy_v2" ON notes;
DROP POLICY IF EXISTS "notes_select_policy" ON notes;
DROP POLICY IF EXISTS "Users can view own notes" ON notes;
DROP POLICY IF EXISTS "Users can view shared notes" ON notes;

-- Unified Select Policy: Optimized for speed
CREATE POLICY "notes_select_policy_v2"
  ON notes FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() 
    OR is_private = false 
    OR check_is_note_shared_definitive(id, auth.uid())
  );

-- 4. ADS RLS UPDATE (Date-based visibility)
-- ==========================================
DROP POLICY IF EXISTS "Everyone can view active ads" ON ads;
CREATE POLICY "Everyone can view active ads" ON ads FOR SELECT
USING (
    status = 'approved' 
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now())
);

-- 5. PERFORMANCE INDEXING
-- ==========================================
CREATE INDEX IF NOT EXISTS notes_owner_id_idx ON notes(owner_id);
CREATE INDEX IF NOT EXISTS notes_is_favorite_idx ON notes(is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS shared_notes_note_id_idx ON shared_notes(note_id);
CREATE INDEX IF NOT EXISTS shared_notes_team_id_idx ON shared_notes(team_id);
-- Removed non-existent column index
CREATE INDEX IF NOT EXISTS team_members_team_user_idx ON team_members(team_id, user_id);
CREATE INDEX IF NOT EXISTS ads_active_window_idx ON ads(status, start_date, end_date) WHERE status = 'approved';

-- 6. REALTIME ENFORCEMENT
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'ads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ads;
  END IF;
END
$$;

COMMIT;
