
-- Create ads table
CREATE TABLE IF NOT EXISTS ads (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  image_url text,
  link_url text,
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'paused')) DEFAULT 'pending',
  priority integer DEFAULT 0,
  views integer DEFAULT 0,
  clicks integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS ads_status_idx ON ads(status);
CREATE INDEX IF NOT EXISTS ads_user_id_idx ON ads(user_id);

-- Enaable RLS
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;

-- Policies

-- Everyone can view approved ads
CREATE POLICY "Everyone can view active ads" ON ads FOR SELECT
USING (status = 'approved');

-- Users can view their own ads regardless of status
CREATE POLICY "Users can view own ads" ON ads FOR SELECT
USING (auth.uid() = user_id);

-- Users can create ads (Pro check enforced in API/App logic)
CREATE POLICY "Users can create ads" ON ads FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own ads
CREATE POLICY "Users can update own ads" ON ads FOR UPDATE
USING (auth.uid() = user_id);

-- Admin policies (using is_admin helper if available, otherwise role check)
CREATE POLICY "Admins can view all ads" ON ads FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update all ads" ON ads FOR UPDATE
USING (is_admin(auth.uid()));
