-- Migration 060: Restore direct note sharing
-- This migration adds back the shared_with_user_id column to shared_notes table
-- and updates helper functions to support direct sharing.

-- 1. Modify shared_notes table
ALTER TABLE shared_notes 
ALTER COLUMN team_id DROP NOT NULL,
ADD COLUMN IF NOT EXISTS shared_with_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- 2. Update unique constraints
ALTER TABLE shared_notes
DROP CONSTRAINT IF EXISTS shared_notes_direct_unique,
ADD CONSTRAINT shared_notes_direct_unique UNIQUE(shared_with_user_id, note_id);

-- 3. Update Helper Functions to include direct sharing
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
      OR shared_with_user_id = p_user_id
      OR (team_id IS NOT NULL AND team_id IN (SELECT team_id FROM team_members WHERE user_id = p_user_id))
    )
  );
$$;

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
    AND (
      shared_by = p_user_id 
      OR shared_with_user_id = p_user_id
      OR (team_id IS NOT NULL AND team_id IN (SELECT team_id FROM team_members WHERE user_id = p_user_id))
    )
    AND permission = 'edit'
  );
$$;

-- 4. Add RLS policies for direct sharing records
DROP POLICY IF EXISTS "shared_notes_direct_select_policy" ON shared_notes;
CREATE POLICY "shared_notes_direct_select_policy"
  ON shared_notes FOR SELECT
  TO authenticated
  USING (
    shared_by = auth.uid()
    OR shared_with_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "shared_notes_direct_all_policy" ON shared_notes;
CREATE POLICY "shared_notes_direct_all_policy"
  ON shared_notes FOR ALL
  TO authenticated
  USING (shared_by = auth.uid());


