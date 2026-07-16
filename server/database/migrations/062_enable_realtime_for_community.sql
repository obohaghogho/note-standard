-- Migration 062: Enable Realtime for Community Features
-- This enables realtime broadcasting for comments and likes tables.

DO $$
BEGIN
  -- Enable realtime for comments
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE comments;
  END IF;

  -- Enable realtime for likes
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'likes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE likes;
  END IF;
END
$$;
