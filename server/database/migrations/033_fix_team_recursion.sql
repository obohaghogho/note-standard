-- Fix Team recursion issues
-- Create a security-definer helper to check membership without RLS recursion
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update team_members SELECT policy
DROP POLICY IF EXISTS "Team members can view members" ON team_members;
CREATE POLICY "Team members can view members"
  ON team_members FOR SELECT TO authenticated
  USING (is_team_member(team_id, auth.uid()));

-- Update teams SELECT policy
DROP POLICY IF EXISTS "Team members can view teams" ON teams;
CREATE POLICY "Team members can view teams"
  ON teams FOR SELECT TO authenticated
  USING (is_team_member(id, auth.uid()));

-- Also update OTHER policies that might be recursive
DROP POLICY IF EXISTS "Owners and admins can add members" ON team_members;
CREATE POLICY "Owners and admins can add members"
  ON team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_team_member(team_members.team_id, auth.uid()) -- Helper check
    OR
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_members.team_id
        AND teams.owner_id = auth.uid()
    )
  );
