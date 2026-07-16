-- ============================================================================
-- Migration 129: EXPAND MESSAGE DELETION PERMISSIONS
-- ============================================================================
-- Purpose:
--   Allow users with 'admin' or 'support' roles to soft-delete any message
--   in the system (Normal/Direct Chats).
-- ============================================================================

BEGIN;

-- 1. Update RLS policies for messages table
-- Drop the existing strict policy
DROP POLICY IF EXISTS "Users can soft delete their own messages" ON public.messages;

-- Create a more permissive policy that includes admins and support
CREATE POLICY "Admins, support or sender can soft delete messages"
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
        AND public.profiles.role IN ('admin', 'support')
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
        AND public.profiles.role IN ('admin', 'support')
    )
  );

-- 2. Verify and harden team_messages policy just in case (already supports admins but consistency is good)
DROP POLICY IF EXISTS "Admins or sender can soft delete team messages" ON public.team_messages;
CREATE POLICY "Admins or sender can soft delete team messages"
  ON public.team_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_messages.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'support')
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_messages.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'support')
    )
  );

COMMIT;
