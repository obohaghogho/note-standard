-- Migration 422: Add Sex Indicator Column to Public Profiles
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds nullable 'sex' column with constraint allowing only 'Male' or 'Female'.
-- Existing accounts default to NULL (unsupplied) and remain 100% valid.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sex VARCHAR(20);

-- Add check constraint if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_sex_check'
    ) THEN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT profiles_sex_check CHECK (sex IN ('Male', 'Female') OR sex IS NULL);
    END IF;
END $$;
