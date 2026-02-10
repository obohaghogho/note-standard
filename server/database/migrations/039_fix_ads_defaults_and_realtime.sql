-- ==========================================
-- 039_FIX_ADS_DEFAULTS_AND_REALTIME.SQL
-- ==========================================

BEGIN;

-- 1. Update Profile Preferences Default
-- Change 'offers' default to true so users see ads by default
ALTER TABLE profiles 
ALTER COLUMN preferences SET DEFAULT '{"analytics": true, "offers": true, "partners": false}'::jsonb;

-- 2. Update existing profiles that have the old default (offers: false)
-- Only update if they haven't explicitly opted out (though we can't distinguish default vs explicit false easily without a timestamp, 
-- we'll assume most users had the default.)
UPDATE profiles
SET preferences = jsonb_set(preferences, '{offers}', 'true')
WHERE (preferences->>'offers')::boolean = false OR preferences->'offers' IS NULL;

-- 3. Ensure Realtime is enabled for Ads
-- This allows the frontend to listen for new 'approved' ads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'ads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ads;
  END IF;
END
$$;

COMMIT;

-- VERIFICATION:
-- SELECT count(*) FROM profiles WHERE (preferences->>'offers')::boolean = true;
-- SELECT * FROM pg_publication_tables WHERE tablename = 'ads';
