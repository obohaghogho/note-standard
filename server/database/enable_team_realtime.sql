-- SAFE ENABLE REALTIME SCRIPT
-- Run this in Supabase SQL Editor to enable realtime for team chat tables
-- It safely checks if tables are already enabled to prevent errors

DO $$
BEGIN
  -- 1. Check if publication exists (it should by default)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- 2. Add 'teams' table
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'teams') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
  END IF;
  
  -- 3. Add 'team_members' table
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'team_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
  END IF;

  -- 4. Add 'team_messages' table
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'team_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_messages;
  END IF;

  -- 5. Add 'shared_notes' table
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'shared_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shared_notes;
  END IF;
  
  -- 6. Add 'team_message_reads' table
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'team_message_reads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_message_reads;
  END IF;
END
$$;
