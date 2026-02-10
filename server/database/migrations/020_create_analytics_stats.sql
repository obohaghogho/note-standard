-- Create table for storing anonymized daily stats
CREATE TABLE IF NOT EXISTS daily_stats (
  date date PRIMARY KEY DEFAULT CURRENT_DATE,
  total_active_users integer DEFAULT 0,
  total_notes_created integer DEFAULT 0,
  top_tags jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view stats (Transparency)
CREATE POLICY "Public can view anonymized stats" ON daily_stats FOR SELECT USING (true);

-- Policy: Only system/admin can insert/update (This is implicitly enforced if no other policies allow write, but let's be safe or just rely on service role)
-- For now, we'll leave write policies empty which means only superuser/service role can write, which is what we want for the background job.
