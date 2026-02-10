-- Add presence tracking fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- Index for background cleanup job performance
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at ON public.profiles(last_active_at) WHERE is_online = true;

-- Update RLS policies to allow users to update their own presence
-- Enable RLS (if not already enabled)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can update their own presence fields
DROP POLICY IF EXISTS "Users can update own presence" ON public.profiles;
CREATE POLICY "Users can update own presence" ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Everyone (authenticated) can read presence fields
DROP POLICY IF EXISTS "Anyone can read profile presence" ON public.profiles;
CREATE POLICY "Anyone can read profile presence" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);
