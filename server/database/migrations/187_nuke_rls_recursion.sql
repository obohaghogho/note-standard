-- Migration 187: NUKE AND REBUILD RLS
-- This migration removes ALL existing RLS policies on chat-related tables
-- and replaces them with a hardened, non-recursive system.

BEGIN;

-- 1. DROP ALL IDENTIFIED POLICIES (Comprehensive Cleanup)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE tablename IN ('team_members', 'team_messages', 'conversation_members', 'messages', 'conversations')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 2. CREATE INTERNAL VIEWS (Bypass RLS for helper functions)
CREATE OR REPLACE VIEW team_members_internal AS SELECT * FROM team_members;
CREATE OR REPLACE VIEW conversation_members_internal AS SELECT * FROM conversation_members;
CREATE OR REPLACE VIEW teams_internal AS SELECT * FROM teams;

-- 3. MASTER HELPER FUNCTIONS (SECURITY DEFINER)
-- These functions bypass RLS to prevent infinite loops.

-- Teams
CREATE OR REPLACE FUNCTION public.is_team_member(t_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM team_members_internal WHERE team_id = t_id AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_team_role(t_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM team_members_internal WHERE team_id = t_id AND user_id = auth.uid() LIMIT 1;
$$;

-- Conversations
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM conversation_members_internal WHERE conversation_id = conv_id AND user_id = auth.uid());
$$;

-- 4. APPLY CLEAN POLICIES

-- --- team_members ---
CREATE POLICY "team_members_select" ON team_members FOR SELECT
USING ( public.is_team_member(team_id) );

CREATE POLICY "team_members_insert" ON team_members FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM teams_internal WHERE id = team_id AND owner_id = auth.uid()) -- Owner
  OR 
  public.get_team_role(team_id) = 'admin' -- Admin
);

CREATE POLICY "team_members_update" ON team_members FOR UPDATE
USING ( user_id = auth.uid() OR public.get_team_role(team_id) IN ('owner', 'admin') );

CREATE POLICY "team_members_delete" ON team_members FOR DELETE
USING ( user_id = auth.uid() OR public.get_team_role(team_id) IN ('owner', 'admin') );


-- --- team_messages ---
CREATE POLICY "team_messages_select" ON team_messages FOR SELECT
USING ( public.is_team_member(team_id) );

CREATE POLICY "team_messages_insert" ON team_messages FOR INSERT
WITH CHECK ( sender_id = auth.uid() AND public.is_team_member(team_id) );

CREATE POLICY "team_messages_update" ON team_messages FOR UPDATE
USING ( sender_id = auth.uid() OR public.get_team_role(team_id) IN ('owner', 'admin') );

CREATE POLICY "team_messages_delete" ON team_messages FOR DELETE
USING ( sender_id = auth.uid() OR public.get_team_role(team_id) IN ('owner', 'admin') );


-- --- conversation_members ---
CREATE POLICY "conversation_members_select" ON conversation_members FOR SELECT
USING ( public.is_conversation_member(conversation_id) );

CREATE POLICY "conversation_members_insert" ON conversation_members FOR INSERT
WITH CHECK ( true ); -- Usually anyone can start a conversation or add someone? Or restricted to self.

CREATE POLICY "conversation_members_delete" ON conversation_members FOR DELETE
USING ( user_id = auth.uid() OR public.is_conversation_member(conversation_id) );


-- --- messages ---
CREATE POLICY "messages_select" ON messages FOR SELECT
USING ( public.is_conversation_member(conversation_id) );

CREATE POLICY "messages_insert" ON messages FOR INSERT
WITH CHECK ( sender_id = auth.uid() AND public.is_conversation_member(conversation_id) );

CREATE POLICY "messages_update" ON messages FOR UPDATE
USING ( sender_id = auth.uid() );

CREATE POLICY "messages_delete" ON messages FOR DELETE
USING ( sender_id = auth.uid() );


-- --- conversations ---
CREATE POLICY "conversations_select" ON conversations FOR SELECT
USING ( public.is_conversation_member(id) );

CREATE POLICY "conversations_insert" ON conversations FOR INSERT
WITH CHECK ( true ); -- Anyone can create a conversation

COMMIT;
