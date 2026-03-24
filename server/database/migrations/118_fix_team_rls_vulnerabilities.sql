-- ====================================
-- PATCH FOR TEAM RBAC VULNERABILITIES
-- Prevents Admins from removing or modifying Owners,
-- Prevents users from being invited as Owners,
-- Prevents Owners from accidentally orphaning a team by leaving.
-- Uses V3 helper functions to avoid RLS recursion loops.
-- ====================================

BEGIN;

-- 1. Drop the flawed M065 policies
DROP POLICY IF EXISTS "Owners and admins can add members" ON team_members;
DROP POLICY IF EXISTS "Members can update themselves, admins can update roles" ON team_members;
DROP POLICY IF EXISTS "Admins can remove members" ON team_members;

-- 2. Recreate INSERT policy (Prevent creating 'owner' role post-creation)
CREATE POLICY "Owners and admins can add members"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    (
      -- Team owner adding someone
      is_team_owner_v3(team_id, auth.uid())
      AND role != 'owner'
    )
    OR
    (
      -- Admin adding someone
      get_team_role_v3(team_id, auth.uid()) = 'admin'
      AND role IN ('admin', 'member')
    )
    OR
    (
      -- Team creation initialization (bypass)
      EXISTS (SELECT 1 FROM teams_internal WHERE id = team_id AND owner_id = auth.uid())
    )
  );

-- 3. Recreate UPDATE policy (Prevent modifying the owner, and prevent setting role to owner)
CREATE POLICY "Members can update themselves, admins can update roles"
  ON team_members FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_team_owner_v3(team_id, auth.uid())
    OR (get_team_role_v3(team_id, auth.uid()) = 'admin' AND role != 'owner')
  )
  WITH CHECK (
    -- user updating their own last_read_at (cannot change own role)
    (user_id = auth.uid() AND role = (SELECT role FROM team_members_internal WHERE id = team_members.id))
    OR 
    -- Owner updating (can't make a new owner)
    (is_team_owner_v3(team_id, auth.uid()) AND role != 'owner')
    OR 
    -- Admin updating (can't touch existing owner, can't make new owner)
    (get_team_role_v3(team_id, auth.uid()) = 'admin' AND role != 'owner')
  );

-- 4. Recreate DELETE policy (Prevent deleting the owner, and prevent owner from abandoning team)
CREATE POLICY "Admins can remove members"
  ON team_members FOR DELETE TO authenticated
  USING (
    -- Only non-owners can leave
    (user_id = auth.uid() AND role != 'owner')
    OR
    -- Owners can kick anyone EXCEPT themselves (handled by first condition)
    (is_team_owner_v3(team_id, auth.uid()) AND user_id != auth.uid())
    OR
    -- Admins can kick non-owners
    (get_team_role_v3(team_id, auth.uid()) = 'admin' AND role != 'owner')
  );

-- ====================================
-- 5. PATCH STORAGE POLICIES
-- Prevents users from uploading files to other teams' directories
-- ====================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
        
        -- Drop the overly permissive upload policy
        IF EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated Upload'
        ) THEN
            DROP POLICY "Authenticated Upload" ON storage.objects;
        END IF;

        -- Recreate secure upload policy
        -- This extracts the team_id from the file path (e.g. "team-id/images/file.png")
        -- and verifies the user is actually a member of that team before allowing the upload.
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Team Members can upload assets'
        ) THEN
            CREATE POLICY "Team Members can upload assets" ON storage.objects 
                FOR INSERT TO authenticated 
                WITH CHECK (
                  bucket_id = 'team-assets' 
                  AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_user_teams_v3(auth.uid()))
                );
        END IF;

    END IF;
END $$;

COMMIT;
