-- Enable RLS on profiles if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Safely create policies if they don't exist
DO $$
BEGIN
    -- 1. Allow users to insert their own profile
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can insert their own profile'
    ) THEN
        CREATE POLICY "Users can insert their own profile"
        ON profiles FOR INSERT
        WITH CHECK (auth.uid() = id);
    END IF;

    -- 2. Allow users to update their own profile
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can update their own profile'
    ) THEN
        CREATE POLICY "Users can update their own profile"
        ON profiles FOR UPDATE
        USING (auth.uid() = id);
    END IF;
END
$$;
