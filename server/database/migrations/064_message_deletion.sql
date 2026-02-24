-- ====================================
-- MESSAGE DELETION SUPPORT
-- ====================================

-- 1. Add is_deleted to messages table (Normal/Direct Chats)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 2. Update RLS policies for messages to allow soft deletion (Update)
CREATE POLICY "Users can soft delete their own messages"
  ON messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- 3. Ensure SELECT only returns non-deleted messages by default via RLS (optional but cleaner)
-- Actually, it's better to just update the controller queries.

-- 4. Team Chat Deletion: Team owners/admins should be able to soft-delete any message
-- The existing DELETE policy is for hard delete. Let's add an UPDATE policy for soft delete.
CREATE POLICY "Admins or sender can soft delete team messages"
  ON team_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = team_messages.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = team_members.team_id -- Fix: should be team_id = team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner', 'admin')
    )
  );

-- Fix for previous logic error in policy (if any)
DROP POLICY IF EXISTS "Admins or sender can soft delete team messages" ON team_messages;
CREATE POLICY "Admins or sender can soft delete team messages"
  ON team_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_messages.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_messages.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );
