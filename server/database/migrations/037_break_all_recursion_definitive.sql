-- ====================================
-- DEFINITIVE RLS RECURSION BREAK
-- ====================================

-- 1. Create a specialized function that returns a list of team IDs for a user
-- This function is SECURITY DEFINER so it can query team_members without triggering RLS
CREATE OR REPLACE FUNCTION get_user_teams(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT team_id FROM team_members WHERE user_id = p_user_id;
$$;

-- 2. Helper to check if user owns a team (queries teams table)
CREATE OR REPLACE FUNCTION is_team_owner(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id AND owner_id = p_user_id);
$$;

-- 3. Update TEAM_MEMBERS Policies
DROP POLICY IF EXISTS "Team members can view members" ON team_members;
CREATE POLICY "Team members can view members"
  ON team_members FOR SELECT 
  TO authenticated
  USING (
    user_id = auth.uid() -- You can ALWAYS see yourself
    OR
    team_id IN (SELECT get_user_teams(auth.uid())) -- You can see members of teams you are in
  );

DROP POLICY IF EXISTS "Owners and admins can add members" ON team_members;
CREATE POLICY "Owners and admins can add members"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    is_team_owner(team_id, auth.uid()) -- Owner can always add
    OR
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_id = team_members.team_id 
      AND user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- 4. Update TEAMS Policies
DROP POLICY IF EXISTS "Team members can view teams" ON teams;
CREATE POLICY "Team members can view teams"
  ON teams FOR SELECT 
  TO authenticated
  USING (
    owner_id = auth.uid() -- Owner
    OR
    id IN (SELECT get_user_teams(auth.uid())) -- Member
  );

-- 5. Update NOTES SELECT Policies (Team access)
DROP POLICY IF EXISTS "Users can view shared notes" ON notes;
CREATE POLICY "Users can view shared notes" 
  ON notes FOR SELECT 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_notes sn
      WHERE sn.note_id = notes.id
      AND (
        sn.shared_by = auth.uid()
        OR
        sn.team_id IN (SELECT get_user_teams(auth.uid()))
      )
    )
  );

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_teams(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_team_owner(UUID, UUID) TO authenticated;
