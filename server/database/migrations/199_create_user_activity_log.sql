-- Migration to create the user_activity_log table for the Knowledge Ecosystem Phase 0

CREATE TABLE IF NOT EXISTS user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_action_type ON user_activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_entity_id ON user_activity_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_created_at ON user_activity_log(created_at);

-- Set up RLS
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own activity log
CREATE POLICY "Users can view own activity log" 
ON user_activity_log FOR SELECT 
USING (auth.uid() = user_id);
