-- =====================================================
-- ADMIN DASHBOARD MIGRATION - Run in Supabase SQL Editor
-- =====================================================

-- STEP 1: Add columns to profiles table
-- =====================================================
DO $$
BEGIN
    -- Add role column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
        ALTER TABLE profiles ADD COLUMN role TEXT DEFAULT 'user';
    END IF;
    
    -- Add status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='status') THEN
        ALTER TABLE profiles ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
    
    -- Add is_online column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_online') THEN
        ALTER TABLE profiles ADD COLUMN is_online BOOLEAN DEFAULT false;
    END IF;
    
    -- Add last_seen column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='last_seen') THEN
        ALTER TABLE profiles ADD COLUMN last_seen TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- STEP 2: Add columns to conversations table (if it exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='conversations') THEN
        -- Add support_status column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='support_status') THEN
            ALTER TABLE conversations ADD COLUMN support_status TEXT DEFAULT 'open';
        END IF;
        
        -- Add chat_type column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='chat_type') THEN
            ALTER TABLE conversations ADD COLUMN chat_type TEXT DEFAULT 'user';
        END IF;
    END IF;
END $$;

-- STEP 3: Add content column to messages (if E2EE was removed)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='messages') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='content') THEN
            ALTER TABLE messages ADD COLUMN content TEXT;
        END IF;
    END IF;
END $$;

-- STEP 4: Add status column to conversation_members
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='conversation_members') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversation_members' AND column_name='status') THEN
            ALTER TABLE conversation_members ADD COLUMN status TEXT DEFAULT 'pending';
        END IF;
    END IF;
END $$;

-- STEP 5: Create indexes (safe - IF NOT EXISTS)
-- =====================================================
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);
CREATE INDEX IF NOT EXISTS profiles_status_idx ON profiles(status);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='conversations') THEN
        CREATE INDEX IF NOT EXISTS conversations_support_status_idx ON conversations(support_status);
        CREATE INDEX IF NOT EXISTS conversations_chat_type_idx ON conversations(chat_type);
    END IF;
END $$;

-- STEP 6: Create helper functions
-- =====================================================
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT role IN ('admin', 'support') FROM profiles WHERE id = user_id),
        false
    );
$$;

CREATE OR REPLACE FUNCTION is_full_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT role = 'admin' FROM profiles WHERE id = user_id),
        false
    );
$$;

-- STEP 7: Drop existing policies if they exist (to avoid conflicts)
-- =====================================================
DO $$
BEGIN
    -- Drop conversation policies
    DROP POLICY IF EXISTS "Admins can view all support conversations" ON conversations;
    DROP POLICY IF EXISTS "Admins can update support conversations" ON conversations;
    
    -- Drop message policies  
    DROP POLICY IF EXISTS "Admins can view all support messages" ON messages;
    DROP POLICY IF EXISTS "Admins can send support messages" ON messages;
    
    -- Drop profile policies
    DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
    DROP POLICY IF EXISTS "Admins can update user status" ON profiles;
EXCEPTION WHEN OTHERS THEN
    -- Ignore errors if tables don't exist
    NULL;
END $$;

-- STEP 8: Create RLS policies for conversations
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='conversations') THEN
        CREATE POLICY "Admins can view all support conversations" ON conversations FOR SELECT
        USING (chat_type = 'support' AND is_admin(auth.uid()));
        
        CREATE POLICY "Admins can update support conversations" ON conversations FOR UPDATE
        USING (chat_type = 'support' AND is_admin(auth.uid()));
    END IF;
END $$;

-- STEP 9: Create RLS policies for messages
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='messages') THEN
        CREATE POLICY "Admins can view all support messages" ON messages FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM conversations c
                WHERE c.id = messages.conversation_id
                AND c.chat_type = 'support'
            )
            AND is_admin(auth.uid())
        );
        
        CREATE POLICY "Admins can send support messages" ON messages FOR INSERT
        WITH CHECK (
            auth.uid() = sender_id AND
            EXISTS (
                SELECT 1 FROM conversations c
                WHERE c.id = conversation_id
                AND c.chat_type = 'support'
            )
            AND is_admin(auth.uid())
        );
    END IF;
END $$;

-- STEP 10: Create RLS policies for profiles (admin access)
-- =====================================================
CREATE POLICY "Admins can read all profiles" ON profiles FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update user status" ON profiles FOR UPDATE
USING (is_full_admin(auth.uid()));

-- =====================================================
-- DONE! Run this entire script in the Supabase SQL Editor
-- =====================================================
