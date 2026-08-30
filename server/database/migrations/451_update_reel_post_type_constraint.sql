-- Migration 451: Add 'reel' to community_posts_post_type_check constraint
ALTER TABLE community_posts DROP CONSTRAINT IF EXISTS community_posts_post_type_check;
ALTER TABLE community_posts ADD CONSTRAINT community_posts_post_type_check CHECK (post_type IN ('text', 'image', 'video', 'link', 'code', 'poll', 'reel'));
