-- 216_device_aware_subscriptions.sql
-- Implements Phase 8 Multi-Device Push Hardening (Option B)

ALTER TABLE public.push_subscriptions
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS device_name TEXT,
ADD COLUMN IF NOT EXISTS platform TEXT;

-- Since 'last_seen_at' is synonymous with updated_at or last_successful_push_at,
-- we'll add it explicitly for tracking when the device was last active on the client.
ALTER TABLE public.push_subscriptions
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- Ensure indexes are present for efficient lookup
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device_id ON public.push_subscriptions(device_id);
