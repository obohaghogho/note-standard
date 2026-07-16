-- Fix infinite recursion in conversation_members
DROP POLICY IF EXISTS "Members can view conversation members" ON conversation_members;

CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv_id
    AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Members can view conversation members" ON conversation_members FOR SELECT
USING ( public.is_conversation_member(conversation_id) );


-- Fix infinite recursion in team_members
DROP POLICY IF EXISTS "Users can view team members" ON team_members;

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

CREATE POLICY "Users can view team members" ON team_members FOR SELECT
USING ( public.is_team_member(team_id) );
