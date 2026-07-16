-- Migration to create the Phase 1 Knowledge Ecosystem tables: Spaces and Community Posts

-- 1. SPACES (Public Communities)
CREATE TABLE IF NOT EXISTS community_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  banner_url text,
  avatar_url text,
  owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  visibility text DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'restricted')),
  member_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS space_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid REFERENCES community_spaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(space_id, user_id)
);

CREATE TABLE IF NOT EXISTS space_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid REFERENCES community_spaces(id) ON DELETE CASCADE,
  rule_title text NOT NULL,
  rule_description text,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 2. COMMUNITY POSTS (Global Feed & Spaces)
CREATE TABLE IF NOT EXISTS community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  space_id uuid REFERENCES community_spaces(id) ON DELETE SET NULL, -- Optional, if posted in a Space
  title text,
  content text,
  post_type text DEFAULT 'text' CHECK (post_type IN (
    'text','article','image','video','audio','code','poll','question','link','checklist'
  )),
  category text DEFAULT 'General',
  tags text[] DEFAULT '{}',
  status text DEFAULT 'public' CHECK (status IN ('draft','private','friends','followers','public')),
  is_pinned boolean DEFAULT false,
  views_count integer DEFAULT 0,
  saves_count integer DEFAULT 0,
  shares_count integer DEFAULT 0,
  media_urls text[] DEFAULT '{}',
  poll_options jsonb,
  link_url text,
  code_language text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  reaction text DEFAULT 'like' CHECK (reaction IN ('like','love','insightful','funny')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES community_comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  likes_count integer DEFAULT 0,
  is_edited boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_community_posts_author ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_space ON community_posts(space_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id);

-- RLS Policies
ALTER TABLE community_spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Spaces are viewable by all" ON community_spaces FOR SELECT USING (visibility = 'public' OR visibility = 'restricted' OR owner_id = auth.uid());

ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Space members are viewable by all" ON space_members FOR SELECT USING (true);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public posts are readable by all" ON community_posts FOR SELECT USING (status = 'public');
CREATE POLICY "Authors can manage own posts" ON community_posts FOR ALL USING (author_id = auth.uid());

ALTER TABLE community_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read likes" ON community_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like" ON community_likes FOR ALL USING (auth.uid() = user_id);

ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read comments" ON community_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON community_comments FOR ALL USING (auth.uid() = author_id);
