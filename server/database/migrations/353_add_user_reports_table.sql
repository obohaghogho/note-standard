-- Create user_reports table for reporting specific users
CREATE TABLE IF NOT EXISTS user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  description text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create user reports" 
  ON user_reports FOR INSERT 
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Admins can view user reports" 
  ON user_reports FOR SELECT 
  USING (auth.jwt() ->> 'role' = 'admin');

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);
