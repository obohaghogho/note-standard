-- Migration 186: DEFINITIVE RLS RECURSION FIX
-- This migration repairs the infinite recursion in team_members and conversation_members
-- that causes chat data to appear "wiped" or fail to load.

BEGIN;

-- 1. CLEANUP: Drop all previous attempts to fix this to ensure a clean state
DROP POLICY IF EXISTS "Team members can view members" ON team_members;
DROP POLICY IF EXISTS "Users can view team members" ON team_members;
DROP POLICY IF EXISTS "Members can view conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Users can view own membership" ON team_members;

-- 2. ROBUST HELPER FUNCTIONS
-- Using SECURITY DEFINER to bypass RLS within the function itself.
-- SET search_path = public is a security best practice for SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.check_is_team_member(t_id uuid)
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

CREATE OR REPLACE FUNCTION public.check_is_conversation_member(conv_id uuid)
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

-- 3. APPLY NON-RECURSIVE POLICIES
-- We use the helper functions which bypass RLS, thus breaking the recursion.

-- For team_members: A user can see a membership record if they are part of that team
CREATE POLICY "team_members_read_policy" 
ON team_members FOR SELECT
USING ( public.check_is_team_member(team_id) );

-- For conversation_members: A user can see a membership record if they are part of that conversation
CREATE POLICY "conversation_members_read_policy" 
ON conversation_members FOR SELECT
USING ( public.check_is_conversation_member(conversation_id) );

-- 4. HARDEN MESSAGES POLICIES
-- Ensure messages also use the non-recursive helpers
DROP POLICY IF EXISTS "Team members can view messages" ON team_messages;
CREATE POLICY "team_messages_read_policy" 
ON team_messages FOR SELECT
USING ( public.check_is_team_member(team_id) );

DROP POLICY IF EXISTS "Members can view messages" ON messages;
CREATE POLICY "messages_read_policy" 
ON messages FOR SELECT
USING ( public.check_is_conversation_member(conversation_id) );

COMMIT;
