-- Migration to expand Spaces for Phase 2: Knowledge Ecosystem
-- Adds the Space Manifest, granular reputation scores, recognition badges, and the Wiki schema.

-- 1. Modify community_spaces
ALTER TABLE community_spaces
ADD COLUMN IF NOT EXISTS manifest JSONB DEFAULT '{
  "features": {
    "voice": false,
    "video": false,
    "events": false,
    "marketplace": false,
    "learning_mode": false,
    "ai": true,
    "wiki": true,
    "collections": true,
    "polls": true
  },
  "theme": {
    "accent": "blue",
    "banner_style": "default"
  },
  "limits": {
    "post_length": 10000,
    "max_upload_mb": 50
  }
}'::jsonb;

ALTER TABLE community_spaces
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS health_score numeric DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS quality_score numeric DEFAULT 100 CHECK (quality_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS mod_score numeric DEFAULT 100 CHECK (mod_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS response_score numeric DEFAULT 100 CHECK (response_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS safety_score numeric DEFAULT 100 CHECK (safety_score BETWEEN 0 AND 100);

-- 2. Modify space_members for Dual-Roles (Permissions vs Recognition)

-- First drop the old role constraint
ALTER TABLE space_members
DROP CONSTRAINT IF EXISTS space_members_role_check;

-- Rename role to permission_role (safely)
DO $$
BEGIN
  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='space_members' and column_name='role')
  THEN
      ALTER TABLE space_members RENAME COLUMN role TO permission_role;
  END IF;
END $$;

-- Enforce the new permission_role constraint
ALTER TABLE space_members
ADD CONSTRAINT space_members_permission_role_check 
CHECK (permission_role IN ('owner', 'admin', 'moderator', 'member'));

-- Add recognition_badges array
ALTER TABLE space_members
ADD COLUMN IF NOT EXISTS recognition_badges text[] DEFAULT '{}';


-- 3. SPACE WIKI ENGINE

CREATE TABLE IF NOT EXISTS space_wiki_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid REFERENCES community_spaces(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES space_wiki_pages(id) ON DELETE SET NULL, -- for nesting (e.g. Intro -> Getting Started)
  title text NOT NULL,
  slug text NOT NULL,
  content text NOT NULL, -- Markdown/HTML content
  page_type text DEFAULT 'article' CHECK (page_type IN ('article', 'faq', 'resource', 'tutorial', 'template', 'glossary', 'roadmap')),
  is_published boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(space_id, slug)
);

CREATE TABLE IF NOT EXISTS space_wiki_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES space_wiki_pages(id) ON DELETE CASCADE,
  editor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  change_summary text,
  created_at timestamptz DEFAULT now()
);

-- Indexes for Wiki
CREATE INDEX IF NOT EXISTS idx_space_wiki_pages_space ON space_wiki_pages(space_id);
CREATE INDEX IF NOT EXISTS idx_space_wiki_revisions_page ON space_wiki_revisions(page_id);

-- 4. SPACE COLLECTIONS
CREATE TABLE IF NOT EXISTS space_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid REFERENCES community_spaces(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  is_pinned boolean DEFAULT false,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS space_collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid REFERENCES space_collections(id) ON DELETE CASCADE,
  post_id uuid REFERENCES community_posts(id) ON DELETE CASCADE,
  added_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(collection_id, post_id)
);

-- RLS Policies

-- Wiki Pages
ALTER TABLE space_wiki_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public space wikis are readable by all" ON space_wiki_pages FOR SELECT USING (
  EXISTS (SELECT 1 FROM community_spaces WHERE id = space_wiki_pages.space_id AND (visibility = 'public' OR visibility = 'restricted'))
);
-- Allow Space members to read private wikis
CREATE POLICY "Space members can read private wikis" ON space_wiki_pages FOR SELECT USING (
  EXISTS (SELECT 1 FROM space_members WHERE space_id = space_wiki_pages.space_id AND user_id = auth.uid())
);
-- Only Admins/Mods can edit for now (can be expanded later via rules engine)
CREATE POLICY "Admins and mods can manage wikis" ON space_wiki_pages FOR ALL USING (
  EXISTS (SELECT 1 FROM space_members WHERE space_id = space_wiki_pages.space_id AND user_id = auth.uid() AND permission_role IN ('owner', 'admin', 'moderator'))
);

-- Collections
ALTER TABLE space_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public space collections are readable by all" ON space_collections FOR SELECT USING (
  EXISTS (SELECT 1 FROM community_spaces WHERE id = space_collections.space_id AND (visibility = 'public' OR visibility = 'restricted'))
);
CREATE POLICY "Space members can read private collections" ON space_collections FOR SELECT USING (
  EXISTS (SELECT 1 FROM space_members WHERE space_id = space_collections.space_id AND user_id = auth.uid())
);
CREATE POLICY "Admins and mods can manage collections" ON space_collections FOR ALL USING (
  EXISTS (SELECT 1 FROM space_members WHERE space_id = space_collections.space_id AND user_id = auth.uid() AND permission_role IN ('owner', 'admin', 'moderator'))
);

ALTER TABLE space_collection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read public collection items" ON space_collection_items FOR SELECT USING (true);
CREATE POLICY "Admins and mods can manage collection items" ON space_collection_items FOR ALL USING (
  EXISTS (SELECT 1 FROM space_members WHERE space_id = (SELECT space_id FROM space_collections WHERE id = collection_id) AND user_id = auth.uid() AND permission_role IN ('owner', 'admin', 'moderator'))
);
