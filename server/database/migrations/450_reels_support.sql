-- Migration 450: Add Reels support to community_posts table

ALTER TABLE community_posts 
ADD COLUMN IF NOT EXISTS is_reel BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS video_duration INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS video_aspect_ratio VARCHAR(20) DEFAULT '9:16';

-- Index for fast Reels feed queries
CREATE INDEX IF NOT EXISTS idx_community_posts_is_reel ON community_posts(is_reel, created_at DESC);
