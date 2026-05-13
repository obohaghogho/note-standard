-- Fix infinite recursion in team_members with the exact policy name
DROP POLICY IF EXISTS "Team members can view members" ON team_members;

-- Ensure the function exists (it was created in 184)
CREATE OR REPLACE FUNCTION public.is_team_member(t_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = t_id
    AND user_id = auth.uid()
  );
$$;

-- Apply the non-recursive policy
CREATE POLICY "Team members can view members" ON team_members FOR SELECT
USING ( public.is_team_member(team_id) );
