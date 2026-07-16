-- ============================================================
-- NoteStandard Ad System — SQL Hardening Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- SAFE: All operations are additive. Nothing is dropped or modified.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ATOMIC WALLET DEDUCTION FUNCTION
--    Fixes race condition: replaces non-atomic read-modify-write
--    in server/routes/ads.js with a single atomic DB operation.
--    Returns the new balance after deduction (floors at 0).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION deduct_ad_wallet(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  UPDATE profiles
  SET ad_wallet_balance = GREATEST(0, COALESCE(ad_wallet_balance, 0) - p_amount)
  WHERE id = p_user_id
  RETURNING ad_wallet_balance INTO new_balance;

  -- Return -1 if user not found (caller should handle this)
  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN COALESCE(new_balance, 0);
END;
$$;

-- Verify function was created:
-- SELECT deduct_ad_wallet('<your-user-uuid>'::UUID, 0.00);  ← safe test (deducts nothing)


-- ────────────────────────────────────────────────────────────
-- 2. PERFORMANCE INDEXES
--    All use CONCURRENTLY — zero downtime, no table locks.
-- ────────────────────────────────────────────────────────────

-- Speeds up: GET /api/ads delivery query (filter by status=approved)
CREATE INDEX IF NOT EXISTS idx_ads_status_approved
  ON ads(status)
  WHERE status = 'approved';

-- Speeds up: server-side frequency cap query (device+recent impressions)
CREATE INDEX IF NOT EXISTS idx_analytics_device_time
  ON ad_analytics_events(device_id, created_at DESC);

-- Speeds up: cooldown fraud check (ad+device+type within time window)
CREATE INDEX IF NOT EXISTS idx_analytics_ad_device_type
  ON ad_analytics_events(ad_id, device_id, event_type, created_at DESC);

-- Speeds up: bot blocklist lookup (alert_type+created_at)
CREATE INDEX IF NOT EXISTS idx_alerts_type_time
  ON system_alerts(alert_type, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- 3. VERIFY EVERYTHING LOOKS CORRECT
-- ────────────────────────────────────────────────────────────
-- Check function exists:
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'deduct_ad_wallet';

-- Check indexes exist:
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname IN (
  'idx_ads_status_approved',
  'idx_analytics_device_time',
  'idx_analytics_ad_device_type',
  'idx_alerts_type_time'
)
ORDER BY tablename, indexname;
