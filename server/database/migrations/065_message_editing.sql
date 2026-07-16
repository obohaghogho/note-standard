-- SQL Migration: Add message editing capability

-- 1. Add `is_edited` to `messages` table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

-- 2. Add `is_edited` to `team_messages` table
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

-- 3. In `messages` we already have `updated_at` (wait, let's verify if `messages` has `updated_at`. If not we don't strictly *need* it since `is_edited` indicates it, but we can add it just in case).
-- But simpler is just relying on `is_edited` flag and modifying `content`.

-- 4. Mark execution complete
COMMENT ON TABLE messages IS 'Messages table with is_edited support';
COMMENT ON TABLE team_messages IS 'Team messages table with is_edited support';
