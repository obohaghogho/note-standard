-- ====================================
-- TEAM COLLABORATION CHAT SYSTEM
-- Database Schema + RLS Policies
-- ====================================

-- Drop existing tables if any
DROP TABLE IF EXISTS team_message_reads CASCADE;
DROP TABLE IF EXISTS shared_notes CASCADE;
DROP TABLE IF EXISTS team_messages CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;

-- ====================================
-- 1. TEAMS TABLE
-- ====================================
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT teams_name_check CHECK (char_length(name) >= 1 AND char_length(name) <= 100)
);

-- Indexes for performance
CREATE INDEX idx_teams_owner_id ON teams(owner_id);
CREATE INDEX idx_teams_created_at ON teams(created_at DESC);
CREATE INDEX idx_teams_archived ON teams(is_archived) WHERE is_archived = FALSE;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teams_updated_at_trigger
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_teams_updated_at();

-- ====================================
-- 2. TEAM_MEMBERS TABLE
-- ====================================
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique membership
  CONSTRAINT team_members_unique UNIQUE(team_id, user_id),
  
  -- Valid roles: owner, admin, member
  CONSTRAINT team_members_role_check CHECK (role IN ('owner', 'admin', 'member'))
);

-- Indexes for performance
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_role ON team_members(team_id, role);

-- ====================================
-- 3. TEAM_MESSAGES TABLE
-- ====================================
CREATE TABLE team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE,
  parent_message_id UUID REFERENCES team_messages(id) ON DELETE SET NULL,
  
  -- Validate message types
  CONSTRAINT team_messages_type_check CHECK (message_type IN ('text', 'note_share', 'system')),
  
  -- Text messages must have content
  CONSTRAINT team_messages_content_check CHECK (
    (message_type = 'text' AND char_length(content) > 0) OR 
    (message_type IN ('note_share', 'system'))
  )
);

-- Indexes for performance (critical for chat)
CREATE INDEX idx_team_messages_team_id_created ON team_messages(team_id, created_at DESC);
CREATE INDEX idx_team_messages_sender_id ON team_messages(sender_id);
CREATE INDEX idx_team_messages_type ON team_messages(team_id, message_type);
CREATE INDEX idx_team_messages_not_deleted ON team_messages(team_id, is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_team_messages_metadata ON team_messages USING GIN(metadata);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_team_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_messages_updated_at_trigger
  BEFORE UPDATE ON team_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_team_messages_updated_at();

-- ====================================
-- 4. SHARED_NOTES TABLE
-- ====================================
CREATE TABLE shared_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES team_messages(id) ON DELETE SET NULL,
  permission TEXT NOT NULL DEFAULT 'read',
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate shares
  CONSTRAINT shared_notes_unique UNIQUE(team_id, note_id),
  
  -- Valid permissions
  CONSTRAINT shared_notes_permission_check CHECK (permission IN ('read', 'edit'))
);

-- Indexes for performance
CREATE INDEX idx_shared_notes_team_id ON shared_notes(team_id);
CREATE INDEX idx_shared_notes_note_id ON shared_notes(note_id);
CREATE INDEX idx_shared_notes_shared_by ON shared_notes(shared_by);
CREATE INDEX idx_shared_notes_message_id ON shared_notes(message_id);

-- ====================================
-- 5. MESSAGE READ TRACKING
-- ====================================
CREATE TABLE team_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate reads
  CONSTRAINT team_message_reads_unique UNIQUE(message_id, user_id)
);

CREATE INDEX idx_team_message_reads_message_id ON team_message_reads(message_id);
CREATE INDEX idx_team_message_reads_user_id ON team_message_reads(user_id);

-- ====================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================

-- Enable RLS on all tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_message_reads ENABLE ROW LEVEL SECURITY;

-- ====================================
-- TEAMS POLICIES
-- ====================================

-- Anyone authenticated can create a team
CREATE POLICY "Users can create teams"
  ON teams
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- Team members can view their teams
CREATE POLICY "Team members can view teams"
  ON teams
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = teams.id
        AND team_members.user_id = auth.uid()
    )
  );

-- Only owners can update teams
CREATE POLICY "Team owners can update teams"
  ON teams
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Only owners can delete teams
CREATE POLICY "Team owners can delete teams"
  ON teams
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ====================================
-- TEAM_MEMBERS POLICIES
-- ====================================

-- Team owners and admins can add members
CREATE POLICY "Owners and admins can add members"
  ON team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
    OR
    -- Owner adding themselves when creating team
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_members.team_id
        AND teams.owner_id = auth.uid()
    )
  );

-- Team members can view other members
CREATE POLICY "Team members can view members"
  ON team_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
    )
  );

-- Members can update their own last_read_at
-- Admins can update roles
CREATE POLICY "Members can update themselves, admins can update roles"
  ON team_members
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() -- Own record
    OR
    EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- Can only update last_read_at for own record
    (user_id = auth.uid() AND role = (SELECT role FROM team_members WHERE id = team_members.id))
    OR
    -- Admins can update roles
    EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- Admins can remove members
CREATE POLICY "Admins can remove members"
  ON team_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
    OR
    user_id = auth.uid() -- Can leave team
  );

-- ====================================
-- TEAM_MESSAGES POLICIES
-- ====================================

-- Team members can send messages
CREATE POLICY "Team members can send messages"
  ON team_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = team_messages.team_id
        AND team_members.user_id = auth.uid()
    )
  );

-- Team members can view messages
CREATE POLICY "Team members can view messages"
  ON team_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = team_messages.team_id
        AND team_members.user_id = auth.uid()
    )
  );

-- Senders can update their own messages (edit)
CREATE POLICY "Senders can update their messages"
  ON team_messages
  FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- Admins or sender can delete messages
CREATE POLICY "Admins or sender can delete messages"
  ON team_messages
  FOR DELETE
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
  );

-- ====================================
-- SHARED_NOTES POLICIES
-- ====================================

-- Team members can share notes they own
CREATE POLICY "Team members can share their notes"
  ON shared_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = shared_notes.team_id
        AND team_members.user_id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = shared_notes.note_id
        AND notes.owner_id = auth.uid()
    )
  );

-- Team members can view shared notes
CREATE POLICY "Team members can view shared notes"
  ON shared_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = shared_notes.team_id
        AND team_members.user_id = auth.uid()
    )
  );

-- Only the sharer can update permissions
CREATE POLICY "Sharers can update note permissions"
  ON shared_notes
  FOR UPDATE
  TO authenticated
  USING (shared_by = auth.uid())
  WITH CHECK (shared_by = auth.uid());

-- Sharer or admins can unshare
CREATE POLICY "Sharers or admins can unshare notes"
  ON shared_notes
  FOR DELETE
  TO authenticated
  USING (
    shared_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = shared_notes.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner', 'admin')
    )
  );

-- ====================================
-- MESSAGE_READS POLICIES
-- ====================================

-- Users can mark messages as read
CREATE POLICY "Users can mark messages as read"
  ON team_message_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND
    EXISTS (
      SELECT 1 FROM team_messages
      JOIN team_members ON team_members.team_id = team_messages.team_id
      WHERE team_messages.id = team_message_reads.message_id
        AND team_members.user_id = auth.uid()
    )
  );

-- Users can view their own read status
CREATE POLICY "Users can view their read status"
  ON team_message_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ====================================
-- HELPER FUNCTIONS
-- ====================================

-- Function to get unread message count for a team
CREATE OR REPLACE FUNCTION get_unread_count(p_team_id UUID, p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM team_messages tm
    WHERE tm.team_id = p_team_id
      AND tm.sender_id != p_user_id
      AND tm.is_deleted = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM team_message_reads tmr
        WHERE tmr.message_id = tm.id
          AND tmr.user_id = p_user_id
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark all messages as read
CREATE OR REPLACE FUNCTION mark_team_messages_read(p_team_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO team_message_reads (message_id, user_id, read_at)
  SELECT tm.id, auth.uid(), NOW()
  FROM team_messages tm
  WHERE tm.team_id = p_team_id
    AND tm.sender_id != auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM team_message_reads tmr
      WHERE tmr.message_id = tm.id
        AND tmr.user_id = auth.uid()
    )
  ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================
-- REALTIME PUBLICATION
-- ====================================

-- Enable Realtime for tables by adding them to the supabase_realtime publication
DO $$
BEGIN
  -- teams
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'teams') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
  END IF;
  
  -- team_members
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'team_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
  END IF;

  -- team_messages
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'team_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_messages;
  END IF;

  -- shared_notes
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'shared_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shared_notes;
  END IF;
  
   -- team_message_reads
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'team_message_reads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_message_reads;
  END IF;
END
$$;

-- ====================================
-- GRANTS (for Supabase service role)
-- ====================================

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ====================================
-- MIGRATION COMPLETE
-- ====================================

-- Insert a comment to track migration
COMMENT ON TABLE teams IS 'Team collaboration system - v1.0.0';
COMMENT ON TABLE team_messages IS 'Real-time team chat messages with type safety';
COMMENT ON TABLE shared_notes IS 'Notes shared within teams with permission control';
