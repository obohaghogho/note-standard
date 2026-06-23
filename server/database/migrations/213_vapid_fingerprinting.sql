-- 213_vapid_fingerprinting.sql
-- Add VAPID fingerprinting to push subscriptions and metrics

ALTER TABLE public.push_subscriptions
ADD COLUMN IF NOT EXISTS vapid_key_version TEXT;

ALTER TABLE public.push_metrics
ADD COLUMN IF NOT EXISTS endpoint_hash TEXT,
ADD COLUMN IF NOT EXISTS vapid_version TEXT;

-- Migration cleanup job: delete subscriptions created before the final production VAPID deployment (May 3rd, 2026)
-- to prevent known 403 Forbidden errors due to VAPID key mismatch.
DELETE FROM public.push_subscriptions
WHERE created_at < '2026-05-03 00:00:00+00';
