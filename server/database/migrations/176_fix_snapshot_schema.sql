-- 176_fix_snapshot_schema.sql
-- Forcefully ensures the 'checksum' column exists and refreshes the schema cache.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'market_snapshots' 
        AND column_name = 'checksum'
    ) THEN
        ALTER TABLE market_snapshots ADD COLUMN checksum TEXT NOT NULL DEFAULT 'initial';
        COMMENT ON COLUMN market_snapshots.checksum IS 'Atomic integrity checksum for rate verification';
    END IF;
END $$;

-- Refresh PostgREST schema cache (Standard Supabase hack to trigger cache refresh)
NOTIFY pgrst, 'reload schema';
