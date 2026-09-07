-- ==============================================================================
-- MIGRATION 462: DEFINITIVE FIX FOR NOTES RLS RECURSION (ERROR 42P17)
-- Resolves: infinite recursion detected in policy for relation "notes"
-- ==============================================================================

BEGIN;

-- 1. DROP ALL EXISTING POLICIES ON notes AND shared_notes TO PREVENT CONFLICTS
DROP POLICY IF EXISTS "notes_select_policy" ON public.notes;
DROP POLICY IF EXISTS "notes_select_policy_v2" ON public.notes;
DROP POLICY IF EXISTS "notes_select_policy_v4" ON public.notes;
DROP POLICY IF EXISTS "notes_insert_policy" ON public.notes;
DROP POLICY IF EXISTS "notes_update_policy" ON public.notes;
DROP POLICY IF EXISTS "notes_delete_policy" ON public.notes;
DROP POLICY IF EXISTS "Users can view own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can view shared notes" ON public.notes;
DROP POLICY IF EXISTS "Users can view public notes" ON public.notes;
DROP POLICY IF EXISTS "Users can insert own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can edit shared notes" ON public.notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;
DROP POLICY IF EXISTS "Public notes are viewable by everyone" ON public.notes;

-- 2. CREATE / UPDATE SECURITY DEFINER HELPER FUNCTIONS
-- Using SECURITY DEFINER bypasses RLS on the queried table inside helper logic, eliminating circular evaluation.

-- Check if user is the note owner
CREATE OR REPLACE FUNCTION public.check_is_note_owner(p_note_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.notes 
    WHERE id = p_note_id AND owner_id = p_user_id
  );
$$;

-- Safely retrieve existing note owner ID without triggering RLS
CREATE OR REPLACE FUNCTION public.get_note_owner_id(p_note_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT owner_id FROM public.notes WHERE id = p_note_id;
$$;

-- Check if note is shared with user (Direct or Team)
CREATE OR REPLACE FUNCTION public.check_is_note_shared_with(p_note_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_notes 
    WHERE note_id = p_note_id 
    AND (
      shared_by = p_user_id
      OR shared_with_user_id = p_user_id
      OR (team_id IS NOT NULL AND team_id IN (SELECT public.get_user_teams_v3(p_user_id)))
    )
  );
$$;

-- Check if user has edit permission on a shared note
CREATE OR REPLACE FUNCTION public.check_has_edit_permission(p_note_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_notes 
    WHERE note_id = p_note_id 
    AND (
      shared_by = p_user_id 
      OR shared_with_user_id = p_user_id
      OR (team_id IS NOT NULL AND team_id IN (SELECT public.get_user_teams_v3(p_user_id)))
    )
    AND permission = 'edit'
  );
$$;

-- 3. REBUILD HARDENED, NON-RECURSIVE RLS POLICIES ON public.notes

-- SELECT: Users can view their own notes, public notes, or notes shared with them
CREATE POLICY "notes_select_policy"
  ON public.notes FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid()) 
    OR is_private = false 
    OR public.check_is_note_shared_with(id, (SELECT auth.uid()))
  );

-- INSERT: Users can insert notes where they are the owner
CREATE POLICY "notes_insert_policy"
  ON public.notes FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- UPDATE: Note owner can update, or shared editor can update (using SECURITY DEFINER helper to check owner preservation)
CREATE POLICY "notes_update_policy"
  ON public.notes FOR UPDATE
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid()) 
    OR public.check_has_edit_permission(id, (SELECT auth.uid()))
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid()) 
    OR owner_id = public.get_note_owner_id(id)
  );

-- DELETE: Only the note owner can delete the note
CREATE POLICY "notes_delete_policy"
  ON public.notes FOR DELETE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- 4. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.check_is_note_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_note_owner_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_note_shared_with(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_has_edit_permission(UUID, UUID) TO authenticated;

COMMIT;
