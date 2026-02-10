-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Safely create ALL necessary policies
DO $$
BEGIN
    -- 1. SELECT: Allow users to view their own profile
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can view their own profile'
    ) THEN
        CREATE POLICY "Users can view their own profile"
        ON profiles FOR SELECT
        USING (auth.uid() = id);
    END IF;

    -- 2. INSERT: Allow users to insert their own profile
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can insert their own profile'
    ) THEN
        CREATE POLICY "Users can insert their own profile"
        ON profiles FOR INSERT
        WITH CHECK (auth.uid() = id);
    END IF;

    -- 3. UPDATE: Allow users to update their own profile
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can update their own profile'
    ) THEN
        CREATE POLICY "Users can update their own profile"
        ON profiles FOR UPDATE
        USING (auth.uid() = id);
    END IF;
    
    -- 4. PUBLIC READ: Allow everyone to view public profiles (username, avatar, etc.)
    -- This depends on the app's privacy model. For now, let's assume authenticated users can read basic profile info of others if needed for search/social?
    -- Actually, Search.tsx queries profiles. If RLS is strictly "own profile", Search will return empty results for other users!
    -- Search.tsx uses: .or(`username.ilike..., ...`)
    -- So we definitely need a policy to allow reading other profiles.
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Public profiles are viewable by everyone'
    ) THEN
        CREATE POLICY "Public profiles are viewable by everyone"
        ON profiles FOR SELECT
        USING (true); -- Or maybe limit columns via view, but for RLS usually we allow SELECT.
        -- If we have "Users can view their own profile", this "viewable by everyone" supersedes it for SELECT.
        -- So we can just drop the specific one or keep it.
        -- Let's make it broad to fix the Search issue too if it exists.
    END IF;
END
$$;

-- Refinement:
-- If we allow "Public profiles are viewable by everyone", we don't strictly need "Users can view their own profile".
-- However, keeping "Users can view their own profile" is fine.
-- BUT, if we have stricter privacy, we might only allow viewing id, username, avatar.
-- For this fix, let's prioritize "Users can view their own profile" and "Anyone can view basic info".
-- Since we can't restrict columns easily with RLS policies (it's row level), we typically just allow SELECT on the table for shared apps.

-- Let's stick to the secure approach:
-- 1. View Own Profile (Full access) - Covered by SELECT referencing id.
-- 2. View Others (Public access) - Needed for collaboration/Search.

-- Revised DO block for the file:
DO $$
BEGIN
    ---------------------------------------------
    -- 1. INSERT
    ---------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can insert their own profile'
    ) THEN
        CREATE POLICY "Users can insert their own profile"
        ON profiles FOR INSERT
        WITH CHECK (auth.uid() = id);
    END IF;

    ---------------------------------------------
    -- 2. UPDATE
    ---------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can update their own profile'
    ) THEN
        CREATE POLICY "Users can update their own profile"
        ON profiles FOR UPDATE
        USING (auth.uid() = id);
    END IF;

    ---------------------------------------------
    -- 3. SELECT (Read)
    ---------------------------------------------
    -- We need to ensure users can read their own profile to verify it exists.
    -- We also likely want them to read others for the social features (Search, Feed).
    -- If there is NO select policy, they can't see anything.
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Profiles are viewable by everyone'
    ) THEN
        CREATE POLICY "Profiles are viewable by everyone"
        ON profiles FOR SELECT
        USING (true);
    END IF;
    
END
$$;
