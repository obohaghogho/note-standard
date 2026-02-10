-- 1. Add preferences to profiles for User Control
-- This stores the user's opt-in/opt-out choices
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{"analytics": true, "offers": false, "partners": false}'::jsonb;

-- 2. Add tags and targeting to ads for Contextual Ads
-- This allows ads to be matched with note content securely
ALTER TABLE ads ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_category text;

-- Index for searching ads by tags (Gin index) for fast lookup
CREATE INDEX IF NOT EXISTS ads_tags_idx ON ads USING GIN (tags);
