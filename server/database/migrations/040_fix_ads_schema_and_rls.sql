-- ==========================================
-- 040_FIX_ADS_SCHEMA_AND_RLS.SQL
-- ==========================================

BEGIN;

-- 1. Add missing columns to 'ads' table
ALTER TABLE ads ADD COLUMN IF NOT EXISTS destination_url TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ DEFAULT now();
ALTER TABLE ads ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

-- 2. Migrate existing data (fallback)
-- If link_url exists, copy to destination_url
UPDATE ads SET destination_url = link_url WHERE destination_url IS NULL AND link_url IS NOT NULL;
-- If image_url exists, copy to media_url
UPDATE ads SET media_url = image_url WHERE media_url IS NULL AND image_url IS NOT NULL;

-- 3. Update RLS policies for date-based visibility
-- Drop old policy if it exists (016 migration had "Everyone can view active ads")
DROP POLICY IF EXISTS "Everyone can view active ads" ON ads;

CREATE POLICY "Everyone can view active ads" ON ads FOR SELECT
USING (
    status = 'approved' 
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now())
);

-- 4. Ensure Realtime is enabled (verification/reinforcement)
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
