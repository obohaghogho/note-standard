-- ====================================
-- ATOMIC TEAM CREATION RPC
-- Resolves race conditions between team and member creation
-- ====================================

CREATE OR REPLACE FUNCTION create_team_v2(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS SETOF teams AS $$
DECLARE
  v_team teams;
BEGIN
  -- 1. Insert Team
  -- owner_id is set to the current authenticated user
  INSERT INTO teams (name, description, avatar_url, owner_id)
  VALUES (p_name, p_description, p_avatar_url, auth.uid())
  RETURNING * INTO v_team;

  -- 2. Insert Owner Member
  -- This happens in the same transaction, bypassing frontend latency
  INSERT INTO team_members (team_id, user_id, role)
  VALUES (v_team.id, auth.uid(), 'owner');

  RETURN NEXT v_team;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION create_team_v2 TO authenticated;
