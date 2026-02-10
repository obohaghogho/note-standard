-- ====================================
-- FIX ALL RLS RECURSION (v3 - Safe Update)
-- Uses SECURITY DEFINER functions to break circular policy references
-- ====================================

-- 1. Helper for Team Membership
-- Use CREATE OR REPLACE only, do not DROP as policies depend on it
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper for Notes Membership
CREATE OR REPLACE FUNCTION is_note_shared_with(p_note_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- A note is accessible if it's in a team where the user is a member
  RETURN EXISTS (
    SELECT 1 FROM shared_notes sn
    WHERE sn.note_id = p_note_id 
    AND is_team_member(sn.team_id, p_user_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update Notes SELECT Policies
DROP POLICY IF EXISTS "Users can view own notes" ON notes;
CREATE POLICY "Users can view own notes" 
  ON notes FOR SELECT 
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can view shared notes" ON notes;
CREATE POLICY "Users can view shared notes" 
  ON notes FOR SELECT 
  USING (is_note_shared_with(id, auth.uid()));

-- 4. Update Shared Notes SELECT Policies
DROP POLICY IF EXISTS "Owner can view share records" ON shared_notes;
DROP POLICY IF EXISTS "Recipient can view share records" ON shared_notes;
DROP POLICY IF EXISTS "Team members can view shared notes" ON shared_notes;
DROP POLICY IF EXISTS "Users can view share records" ON shared_notes;

CREATE POLICY "Users can view share records"
  ON shared_notes FOR SELECT
  USING (
    auth.uid() = shared_by -- Sharer
    OR 
    EXISTS (SELECT 1 FROM notes WHERE id = note_id AND owner_id = auth.uid()) -- Owner
    OR
    is_team_member(team_id, auth.uid()) -- Team member
  );

-- 5. Update Teams SELECT Policies
DROP POLICY IF EXISTS "Team members can view teams" ON teams;
CREATE POLICY "Team members can view teams"
  ON teams FOR SELECT 
  USING (is_team_member(id, auth.uid()));

-- 6. Update Team Members SELECT Policies
DROP POLICY IF EXISTS "Team members can view members" ON team_members;
CREATE POLICY "Team members can view members"
  ON team_members FOR SELECT 
  USING (is_team_member(team_id, auth.uid()));

-- 7. Update other potentially recursive policies mentioned in error log
DROP POLICY IF EXISTS "Owners and admins can add members" ON team_members;
CREATE POLICY "Owners and admins can add members"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    is_team_member(team_id, auth.uid()) 
    OR 
    EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id AND owner_id = auth.uid())
  );

-- 8. Grant access to functions
GRANT EXECUTE ON FUNCTION is_team_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_note_shared_with(UUID, UUID) TO authenticated;
