-- Migration: 195_user_blocking_system.sql
-- Implements user blocking mechanism for NoteStandard chat.

CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- Enable RLS
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist and recreate
DROP POLICY IF EXISTS "Users can manage their own blocks" ON user_blocks;
DROP POLICY IF EXISTS "Users can view who they blocked" ON user_blocks;

CREATE POLICY "Users can manage their own blocks"
  ON user_blocks
  FOR ALL
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can view who they blocked"
  ON user_blocks
  FOR SELECT
  USING (auth.uid() = blocker_id);

-- Safely add to Realtime publication if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_blocks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_blocks;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
