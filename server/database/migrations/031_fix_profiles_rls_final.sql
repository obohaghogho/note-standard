-- Definitive Fix for Profiles RLS
-- This script safely DROPS existing policies to ensure no conflicts, 
-- then RECREATES them with the correct permissions.

-- 1. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to start fresh (avoids "policy already exists" errors)
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

-- 3. Create Policies

-- READ: Allow everyone to read profiles (Required for Search and checking own profile)
CREATE POLICY "Profiles are viewable by everyone"
ON profiles FOR SELECT
USING (true);

-- INSERT: Allow users to insert their OWN profile
-- This is critical for the `ensureProfile` function/auto-creation
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- UPDATE: Allow users to update their OWN profile
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- 4. Retroactive Fix: Ensure all existing auth users have a profile
-- This block finds users in auth.users who do not have a profile 
-- and inserts a placeholder profile for them.
-- Note: We need to use `security definer` logic if we were wrapping this in a function,
-- but as a migration script run by admin/postgres, it has permissions.

INSERT INTO public.profiles (id, email, username, full_name, avatar_url)
SELECT 
    au.id, 
    au.email, 

    -- Force unique username by ALWAYS appending part of ID (metadata OR email source)
    COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1)) || '_' || substr(au.id::text, 1, 5),
    COALESCE(au.raw_user_meta_data->>'full_name', ''),
    COALESCE(au.raw_user_meta_data->>'avatar_url', '')
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL;
