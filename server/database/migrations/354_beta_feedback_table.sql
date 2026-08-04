-- Create beta_feedback table for gathering in-app beta tester bug reports, suggestions, and ratings
CREATE TABLE IF NOT EXISTS beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('bug', 'improvement', 'rating', 'other')),
  rating int CHECK (rating BETWEEN 1 AND 5),
  title text,
  comment text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved', 'dismissed')),
  admin_notes text,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;

-- Policies:
-- 1. Any authenticated user can submit feedback (or anonymous if user_id is null)
CREATE POLICY "Users can submit beta feedback" 
  ON beta_feedback FOR INSERT 
  WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid());

-- 2. Users can read their own submitted feedback
CREATE POLICY "Users can view own feedback" 
  ON beta_feedback FOR SELECT 
  USING (user_id = auth.uid());

-- 3. Admins can view all beta feedback
CREATE POLICY "Admins can view all beta feedback" 
  ON beta_feedback FOR SELECT 
  USING (auth.jwt() ->> 'role' = 'admin' OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 4. Admins can update status and notes
CREATE POLICY "Admins can update beta feedback" 
  ON beta_feedback FOR UPDATE 
  USING (auth.jwt() ->> 'role' = 'admin' OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status ON beta_feedback(status);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_type ON beta_feedback(type);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created_at ON beta_feedback(created_at DESC);
