-- ==========================================
-- SYNC PROFILES AND SUBSCRIPTIONS SCHEMA
-- ==========================================

-- 1. Update Profiles Table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user',
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- 2. Update Subscriptions Table
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE;

-- 3. Add index for role-based queries (if needed for admin)
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);
