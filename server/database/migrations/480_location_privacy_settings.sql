-- Migration 480: Location Privacy Settings
-- Adds location_visibility column to profiles with default 'hidden' for privacy-first security

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'location_visibility'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN location_visibility TEXT DEFAULT 'hidden' CHECK (location_visibility IN ('visible', 'hidden'));
    END IF;
END $$;

-- Update existing profiles that have null location_visibility to 'hidden'
UPDATE public.profiles 
SET location_visibility = 'hidden' 
WHERE location_visibility IS NULL;

-- Create index for high-performance permission evaluation during profile queries
CREATE INDEX IF NOT EXISTS idx_profiles_location_privacy ON public.profiles(id, location_visibility);
