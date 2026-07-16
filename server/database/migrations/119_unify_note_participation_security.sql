-- ====================================
-- UNIFIED NOTE SHARING & PARTICIPATION SECURITY
-- 1. Restores direct-to-user sharing (broken by M041/M065)
-- 2. Secures comments and likes to prevent metadata leaks
-- 3. Unifies logic into a recursion-safe V4 helper
-- ====================================

BEGIN;

-- 1. Helper Function V4 (Includes Direct Sharing + Team Sharing + Security Definer)
-- Use this for all note-access checks to ensure recursion safety.
CREATE OR REPLACE FUNCTION check_is_note_shared_definitive_v4(p_note_id UUID, p_user_id UUID)
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
      OR shared_with_user_id = p_user_id
      OR (team_id IS NOT NULL AND team_id IN (SELECT public.get_user_teams_v3(p_user_id)))
    )
  );
$$;

-- 2. Lock down SHARED_NOTES table (M065 only allowed team shares)
DROP POLICY IF EXISTS "Team members can view shared notes" ON shared_notes;
DROP POLICY IF EXISTS "Team members can view shared notes_v2" ON shared_notes;
DROP POLICY IF EXISTS "shared_notes_direct_select_policy" ON shared_notes;

CREATE POLICY "shared_notes_select_comprehensive_v4"
  ON shared_notes FOR SELECT TO authenticated
  USING (
    shared_by = auth.uid()
    OR shared_with_user_id = auth.uid()
    OR (team_id IS NOT NULL AND team_id IN (SELECT get_user_teams_v3(auth.uid())))
  );

-- 3. Lock down NOTES table (M041 was missing direct shares)
DROP POLICY IF EXISTS "notes_select_policy_v2" ON notes;
DROP POLICY IF EXISTS "Public notes are viewable by everyone" ON notes;
DROP POLICY IF EXISTS "Users can view public notes" ON notes;

CREATE POLICY "notes_select_policy_v4"
  ON notes FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid() 
    OR is_private = false 
    OR check_is_note_shared_definitive_v4(id, auth.uid())
  );

-- 4. Fix LIKES and COMMENTS (Previously 'true' was too permissive)
DROP POLICY IF EXISTS "Everyone can view comments" ON comments;
DROP POLICY IF EXISTS "Everyone can view likes" ON likes;

CREATE POLICY "comments_select_policy_v4"
  ON comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notes 
      WHERE notes.id = comments.note_id 
      AND (
        notes.owner_id = auth.uid()
        OR notes.is_private = false
        OR check_is_note_shared_definitive_v4(notes.id, auth.uid())
      )
    )
  );

CREATE POLICY "likes_select_policy_v4"
  ON likes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notes 
      WHERE notes.id = likes.note_id 
      AND (
        notes.owner_id = auth.uid()
        OR notes.is_private = false
        OR check_is_note_shared_definitive_v4(notes.id, auth.uid())
      )
    )
  );

COMMIT;
