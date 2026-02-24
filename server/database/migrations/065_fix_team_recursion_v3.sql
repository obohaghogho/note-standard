-- Migration 065: Break Team RLS Recursion definitively using Security Definer views
-- This pattern is used to bypass RLS when a policy needs to query the table it's protecting.

BEGIN;

-- 1. Create Internal Views that bypass RLS
-- We use these inside security definer functions to break the recursion chain.
CREATE OR REPLACE VIEW team_members_internal AS SELECT * FROM team_members;
CREATE OR REPLACE VIEW teams_internal AS SELECT * FROM teams;

-- 2. Helper Functions (SECURITY DEFINER)
-- These functions run with the privileges of the creator (postgres) and bypass RLS.
-- This is the ONLY way to safely check membership within an RLS policy on the same table.

CREATE OR REPLACE FUNCTION get_user_teams_v3(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT team_id FROM team_members_internal WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION get_team_role_v3(p_team_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM team_members_internal WHERE team_id = p_team_id AND user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION is_team_owner_v3(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM teams_internal WHERE id = p_team_id AND owner_id = p_user_id);
$$;

-- 3. Redefine TEAMS Policies
-- Break the recursion by using the non-RLS helper functions.
DROP POLICY IF EXISTS "Team members can view teams" ON teams;
CREATE POLICY "Team members can view teams"
  ON teams FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid() 
    OR 
    id IN (SELECT get_user_teams_v3(auth.uid()))
  );

-- 4. Redefine TEAM_MEMBERS Policies
-- This is where the most common recursion happened.
DROP POLICY IF EXISTS "Team members can view members" ON team_members;
CREATE POLICY "Team members can view members"
  ON team_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR
    team_id IN (SELECT get_user_teams_v3(auth.uid()))
  );

DROP POLICY IF EXISTS "Owners and admins can add members" ON team_members;
CREATE POLICY "Owners and admins can add members"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    is_team_owner_v3(team_id, auth.uid())
    OR
    get_team_role_v3(team_id, auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Admins can remove members" ON team_members;
CREATE POLICY "Admins can remove members"
  ON team_members FOR DELETE TO authenticated
  USING (
    is_team_owner_v3(team_id, auth.uid())
    OR
    get_team_role_v3(team_id, auth.uid()) = 'admin'
    OR
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Members can update themselves, admins can update roles" ON team_members;
CREATE POLICY "Members can update themselves, admins can update roles"
  ON team_members FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR
    get_team_role_v3(team_id, auth.uid()) IN ('owner', 'admin')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR
    get_team_role_v3(team_id, auth.uid()) IN ('owner', 'admin')
  );

-- 5. Fix TEAM_MESSAGES Policies
DROP POLICY IF EXISTS "Team members can send messages" ON team_messages;
CREATE POLICY "Team members can send messages"
  ON team_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND
    team_id IN (SELECT get_user_teams_v3(auth.uid()))
  );

DROP POLICY IF EXISTS "Team members can view messages" ON team_messages;
CREATE POLICY "Team members can view messages"
  ON team_messages FOR SELECT TO authenticated
  USING (
    team_id IN (SELECT get_user_teams_v3(auth.uid()))
  );

DROP POLICY IF EXISTS "Admins or sender can soft delete team messages" ON team_messages;
CREATE POLICY "Admins or sender can soft delete team messages"
  ON team_messages FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    OR
    get_team_role_v3(team_id, auth.uid()) IN ('owner', 'admin')
  );

-- 6. Ensure SHARED_NOTES Policies are also non-recursive
DROP POLICY IF EXISTS "Team members can view shared notes" ON shared_notes;
CREATE POLICY "Team members can view shared notes"
  ON shared_notes FOR SELECT TO authenticated
  USING (
    team_id IN (SELECT get_user_teams_v3(auth.uid()))
  );

COMMIT;
