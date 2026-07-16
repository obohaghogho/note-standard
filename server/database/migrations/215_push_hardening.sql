-- 215_push_hardening.sql
-- Implements Phase 8 Push Hardening Fixes

-- 1. Endpoint Deduplication
-- Requirement: One endpoint = one database row.
-- Currently, the unique constraint is on (user_id, endpoint). We need a global unique constraint on endpoint.
-- We must first clean up any duplicates (same endpoint, different users). We keep the most recently updated one.

-- Create a temporary table to hold the latest subscription ID for each endpoint
CREATE TEMP TABLE latest_endpoints AS
SELECT DISTINCT ON (endpoint) id, endpoint
FROM public.push_subscriptions
ORDER BY endpoint, updated_at DESC;

-- Delete all subscriptions that are not the latest for their endpoint
DELETE FROM public.push_subscriptions
WHERE id NOT IN (SELECT id FROM latest_endpoints);

-- Now drop the old composite constraint if it exists (usually named push_subscriptions_user_id_endpoint_key)
ALTER TABLE public.push_subscriptions
DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_endpoint_key;

-- Add the new global unique constraint on endpoint
ALTER TABLE public.push_subscriptions
ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

-- 2. Last-Seen Tracking
-- Add columns to track the exact lifecycle of the subscription
ALTER TABLE public.push_subscriptions
ADD COLUMN IF NOT EXISTS last_successful_push_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_failed_push_at TIMESTAMPTZ;

-- 3. Automatic Health Scoring
-- Status tracking enum/text
-- Rules: 
--   'healthy' (default)
--   'invalid' (got 403 or 410)
--   'stale' (30+ days no successful push) - this is evaluated dynamically or updated via cron
ALTER TABLE public.push_subscriptions
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'healthy';

-- Backfill existing subscriptions
UPDATE public.push_subscriptions
SET status = 'healthy'
WHERE status IS NULL;
