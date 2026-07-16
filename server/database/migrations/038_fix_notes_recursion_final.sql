-- ==========================================
-- 038_FIX_NOTES_RECURSION_FINAL.SQL
-- ==========================================
-- Objective: Resolve "infinite recursion detected in policy" (Error 42P17)
-- Strategy: Use SECURITY DEFINER functions to break circular RLS dependencies.

BEGIN;

-- 1. CLEANUP: Drop problematic policies
-- We drop all to ensure a clean state
DROP POLICY IF EXISTS "Users can view own notes" ON notes;
DROP POLICY IF EXISTS "Users can view shared notes" ON notes;
DROP POLICY IF EXISTS "Users can view public notes" ON notes;
DROP POLICY IF EXISTS "Users can insert own notes" ON notes;
DROP POLICY IF EXISTS "Users can update own notes" ON notes;
DROP POLICY IF EXISTS "Users can edit shared notes" ON notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON notes;

DROP POLICY IF EXISTS "Owner can view share records" ON shared_notes;
DROP POLICY IF EXISTS "Recipient can view share records" ON shared_notes;
DROP POLICY IF EXISTS "Owner can share notes" ON shared_notes;
DROP POLICY IF EXISTS "Owner can revoke share" ON shared_notes;
DROP POLICY IF EXISTS "Team members can view shared notes" ON shared_notes;
DROP POLICY IF EXISTS "Users can view share records" ON shared_notes;
DROP POLICY IF EXISTS "Team members can share their notes" ON shared_notes;
DROP POLICY IF EXISTS "Sharers can update note permissions" ON shared_notes;
DROP POLICY IF EXISTS "Sharers or admins can unshare notes" ON shared_notes;

-- 2. HELPER FUNCTIONS: Security Definer to bypass RLS
-- These functions break the loop by querying the table directly without triggering RLS.

-- Check if a user is the owner of a note
CREATE OR REPLACE FUNCTION check_is_note_owner(p_note_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM notes 
    WHERE id = p_note_id AND owner_id = p_user_id
  );
$$;

-- Check if a note is shared with a user (Directly or via Team)
CREATE OR REPLACE FUNCTION check_is_note_shared_with(p_note_id UUID, p_user_id UUID)
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

-- Check if user has edit permission on a shared note
CREATE OR REPLACE FUNCTION check_has_edit_permission(p_note_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM shared_notes 
    WHERE note_id = p_note_id 
    AND (shared_by = p_user_id OR team_id IN (SELECT team_id FROM team_members WHERE user_id = p_user_id))
    AND permission = 'edit'
  );
$$;

-- 3. NOTES POLICIES (Non-recursive)

-- SELECT: Users can see their own, public, or shared notes
CREATE POLICY "notes_select_policy"
  ON notes FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() 
    OR is_private = false 
    OR check_is_note_shared_with(id, auth.uid())
  );

-- INSERT: Users can only create notes for themselves
CREATE POLICY "notes_insert_policy"
  ON notes FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- UPDATE: Owners can edit, and shared users with 'edit' permission can edit
CREATE POLICY "notes_update_policy"
  ON notes FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid() 
    OR check_has_edit_permission(id, auth.uid())
  )
  WITH CHECK (
    -- Ensure they don't change ownership via update
    (owner_id = auth.uid() OR (SELECT owner_id FROM notes WHERE id = notes.id) = owner_id)
  );

-- DELETE: Only owner can delete
CREATE POLICY "notes_delete_policy"
  ON notes FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- 4. SHARED_NOTES POLICIES (Non-recursive)

-- SELECT: Sharer, Owner, or Recipient (Team Member) can see share record
CREATE POLICY "shared_notes_select_policy"
  ON shared_notes FOR SELECT
  TO authenticated
  USING (
    shared_by = auth.uid()
    OR check_is_note_owner(note_id, auth.uid())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- INSERT: Only the note owner can initiate a share
CREATE POLICY "shared_notes_insert_policy"
  ON shared_notes FOR INSERT
  TO authenticated
  WITH CHECK (check_is_note_owner(note_id, auth.uid()));

-- DELETE: Owner or the Sharer can revoke access
CREATE POLICY "shared_notes_delete_policy"
  ON shared_notes FOR DELETE
  TO authenticated
  USING (
    shared_by = auth.uid()
    OR check_is_note_owner(note_id, auth.uid())
  );

-- 5. GRANTS
GRANT EXECUTE ON FUNCTION check_is_note_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_is_note_shared_with(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_has_edit_permission(UUID, UUID) TO authenticated;

COMMIT;

-- VERIFICATION QUERIES (Run these in Supabase SQL Editor):
-- 1. Check if selection works: SELECT count(*) FROM notes;
-- 2. Verify own notes: SELECT * FROM notes WHERE owner_id = auth.uid();
-- 3. Verify public notes: SELECT * FROM notes WHERE is_private = false;
