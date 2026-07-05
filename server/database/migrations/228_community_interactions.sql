-- Community Module Production Tables
-- Migration 228

CREATE TABLE IF NOT EXISTS community_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS community_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_post_hashtags (
  post_id uuid REFERENCES community_posts(id) ON DELETE CASCADE,
  hashtag_id uuid REFERENCES community_hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

CREATE TABLE IF NOT EXISTS community_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES community_comments(id) ON DELETE CASCADE, -- null if post mention
  mentioned_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  post_id uuid REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES community_comments(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES community_posts(id) ON DELETE CASCADE,
  question text NOT NULL,
  ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid REFERENCES community_polls(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  votes_count integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS community_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid REFERENCES community_polls(id) ON DELETE CASCADE,
  option_id uuid REFERENCES community_poll_options(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_community_bookmarks_user ON community_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_community_follows_follower ON community_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_community_follows_following ON community_follows(following_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_status ON community_reports(status);

-- RLS
ALTER TABLE community_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own bookmarks" ON community_bookmarks FOR ALL USING (user_id = auth.uid());

ALTER TABLE community_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read follows" ON community_follows FOR SELECT USING (true);
CREATE POLICY "Users can manage own follows" ON community_follows FOR ALL USING (follower_id = auth.uid());

ALTER TABLE community_hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read hashtags" ON community_hashtags FOR SELECT USING (true);

ALTER TABLE community_post_hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read post hashtags" ON community_post_hashtags FOR SELECT USING (true);

ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create reports" ON community_reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Admins can view reports" ON community_reports FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');
