-- Supabase Security Migration: Default Privileges
-- This migration ensures that all future tables and existing tables have the appropriate API access
-- to prevent the app from breaking due to Supabase's new security rollout.

-- ==============================================================================
-- STEP 1: FIX EXISTING TABLES
-- ==============================================================================

-- Grant necessary permissions to existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

-- ==============================================================================
-- STEP 2: SET DEFAULT PRIVILEGES FOR FUTURE TABLES
-- ==============================================================================

-- Automatically grant these permissions whenever a new table is created in public
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO service_role;

-- ==============================================================================
-- STEP 3: REALTIME SYNC (Optional but recommended for the chat app)
-- ==============================================================================
-- Add core chat and realtime tables to the supabase_realtime publication 
-- (This assumes the publication exists, which is standard on Supabase).
-- Using a DO block to prevent errors if the tables don't exist or are already added.

DO $$
BEGIN
    -- Only try to add if the publication exists
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        
        -- Add messages
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE messages';
        END IF;

        -- Add chats / conversations
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE conversations';
        END IF;
        
        -- Add notifications
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE notifications';
        END IF;

    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Ignore error if table is already in the publication
    NULL;
END $$;
