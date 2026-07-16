-- Migration: Add plan_tier to profiles
-- Description: Adds a column to keep track of user subscription tier directly in the profile for easy access in chat/UI.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'free';

-- Populate existing profiles from subscriptions table (if any)
UPDATE profiles p
SET plan_tier = s.plan_tier
FROM subscriptions s
WHERE p.id = s.user_id AND s.status = 'active';
