-- ============================================================
-- Migration 129: Fix push_subscriptions schema mismatch
--
-- Problem: Migration 015 stored the whole subscription as a
-- JSONB blob (`subscription JSONB`). The controller and
-- notification service expect three flat columns:
--   endpoint TEXT, p256dh TEXT, auth TEXT
-- with a unique constraint on (user_id, endpoint).
--
-- Fix: Drop and recreate the table with the correct schema.
-- Existing subscriptions are lost, but they will be
-- re-created automatically on the next user login.
-- ============================================================

-- Drop dependent policies first (they reference the old table)
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions"   ON push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON push_subscriptions;

-- Drop the old table
DROP TABLE IF EXISTS push_subscriptions;

-- Recreate with correct flat schema
CREATE TABLE push_subscriptions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    -- One subscription per (user, browser endpoint)
    UNIQUE (user_id, endpoint)
);

-- Auto-update updated_at on upsert
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_push_subscriptions_updated_at();

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert their own push subscriptions"
    ON push_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own push subscriptions"
    ON push_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push subscriptions"
    ON push_subscriptions FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can upsert (needed by the server-side controller
-- which uses the service-role key and does NOT go via RLS)
CREATE POLICY "Service role full access to push_subscriptions"
    ON push_subscriptions
    USING (true)
    WITH CHECK (true);

-- Index for fast lookup of a user's subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON push_subscriptions (user_id);
