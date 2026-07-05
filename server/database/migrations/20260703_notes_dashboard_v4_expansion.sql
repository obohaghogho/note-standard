-- Notes Dashboard Expansion Migration
-- Milestone 1 Schema

-- 1. Create note_categories table
CREATE TABLE IF NOT EXISTS note_categories (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  icon text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. Alter notes table to add new columns
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES note_categories(id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS last_opened_at timestamptz DEFAULT now();
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_type text DEFAULT 'text' CHECK (note_type IN ('text', 'checklist', 'voice', 'image', 'drawing', 'document'));
ALTER TABLE notes ADD COLUMN IF NOT EXISTS cover_image text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS color varchar(30);
ALTER TABLE notes ADD COLUMN IF NOT EXISTS word_count integer DEFAULT 0;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reading_time integer DEFAULT 0;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_at timestamptz;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_completed boolean DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS repeat_type text CHECK (repeat_type IN ('none', 'daily', 'weekly', 'monthly', 'yearly')) DEFAULT 'none';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS version integer DEFAULT 1 NOT NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 3. Create tags table
CREATE TABLE IF NOT EXISTS tags (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 4. Create note_tags join table
CREATE TABLE IF NOT EXISTS note_tags (
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

-- 5. Create note_files table
CREATE TABLE IF NOT EXISTS note_files (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_provider text NOT NULL DEFAULT 'local',
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  width integer,
  height integer,
  duration integer,
  page_count integer,
  checksum text,
  created_at timestamptz DEFAULT now()
);

-- 6. Create note_permissions table
CREATE TABLE IF NOT EXISTS note_permissions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')) DEFAULT 'viewer',
  created_at timestamptz DEFAULT now(),
  UNIQUE(note_id, user_id)
);

-- 7. Create note_comments table
CREATE TABLE IF NOT EXISTS note_comments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  parent_comment_id uuid REFERENCES note_comments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  edited_at timestamptz
);

-- 8. Create favorite_notes table
CREATE TABLE IF NOT EXISTS favorite_notes (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY(user_id, note_id)
);

-- 9. Create note_versions table
CREATE TABLE IF NOT EXISTS note_versions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  title text,
  content text,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at timestamptz DEFAULT now()
);

-- 10. Create note_relationships table
CREATE TABLE IF NOT EXISTS note_relationships (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  parent_note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  child_note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  relationship_type text DEFAULT 'parent-child' CHECK (relationship_type IN ('parent-child', 'related', 'reference')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT no_self_reference CHECK (parent_note_id != child_note_id),
  UNIQUE(parent_note_id, child_note_id)
);

-- 11. Create dashboard_layout table
CREATE TABLE IF NOT EXISTS dashboard_layout (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  widget text NOT NULL,
  position integer NOT NULL,
  visible boolean DEFAULT true,
  width text DEFAULT 'full',
  UNIQUE(user_id, position)
);

-- 12. Create ai_generations table
CREATE TABLE IF NOT EXISTS ai_generations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  response text NOT NULL,
  action_type text NOT NULL,
  model text NOT NULL,
  provider text NOT NULL,
  tokens_used integer,
  latency_ms integer,
  estimated_cost numeric,
  status text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 13. Create note_activities table
CREATE TABLE IF NOT EXISTS note_activities (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text CHECK (action_type IN ('created', 'edited', 'deleted', 'opened', 'searched', 'exported', 'printed', 'downloaded', 'duplicated', 'commented', 'collaborated', 'shared', 'restored', 'pinned', 'archived', 'favorited', 'ai_summarized', 'ai_translated', 'ai_rewritten')) NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 14. Create notifications table (dashboard-ready)
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  delivery_status text DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'delivered', 'failed')),
  channel text CHECK (channel IN ('in-app', 'push', 'email')) DEFAULT 'in-app',
  expires_at timestamptz,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 15. Create full-text search triggers and vectors
CREATE OR REPLACE FUNCTION notes_search_trigger_fn() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_search_update_trig ON notes;
CREATE TRIGGER notes_search_update_trig
BEFORE INSERT OR UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION notes_search_trigger_fn();

-- Populate existing notes vectors if any exist
UPDATE notes SET search_vector = 
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B');

-- 16. Indexes for Performance & Observability
CREATE INDEX IF NOT EXISTS notes_search_idx ON notes USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS notes_owner_deleted_archived_idx ON notes(owner_id, deleted_at, is_archived);
CREATE INDEX IF NOT EXISTS notes_last_opened_idx ON notes(last_opened_at);
CREATE INDEX IF NOT EXISTS notes_category_idx ON notes(category_id);
CREATE INDEX IF NOT EXISTS notes_type_idx ON notes(note_type);
CREATE INDEX IF NOT EXISTS note_activities_user_created_idx ON note_activities(user_id, created_at);
CREATE INDEX IF NOT EXISTS note_tags_composite_idx ON note_tags(note_id, tag_id);
CREATE INDEX IF NOT EXISTS tags_user_name_idx ON tags(user_id, name);
