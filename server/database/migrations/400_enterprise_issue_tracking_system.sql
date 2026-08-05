-- 400_enterprise_issue_tracking_system.sql
-- Production SQL Migration for Enterprise Feedback, Crash Reporting, Feature Requests & Issue Tracking

-- 1. Categories Lookup & Registry
CREATE TABLE IF NOT EXISTS feedback_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon_name text NOT NULL,
  color_hex text NOT NULL,
  badge_color_class text NOT NULL,
  is_active boolean DEFAULT true,
  display_order int DEFAULT 0
);

INSERT INTO feedback_categories (id, name, description, icon_name, color_hex, badge_color_class, display_order) VALUES
  ('bug_report', 'Bug Report', 'Software defect, unexpected behavior, or visual glitch', 'Bug', '#f43f5e', 'bg-rose-500/15 text-rose-300 border-rose-500/30', 1),
  ('feature_request', 'Feature Request', 'Proposal for new capability, integration, or tool', 'Sparkles', '#f59e0b', 'bg-amber-500/15 text-amber-300 border-amber-500/30', 2),
  ('improvement', 'Improvement Suggestion', 'Refinement to existing feature or usability boost', 'Zap', '#3b82f6', 'bg-blue-500/15 text-blue-300 border-blue-500/30', 3),
  ('general', 'General Feedback', 'General commentary, feedback, or review', 'MessageSquare', '#94a3b8', 'bg-slate-500/15 text-slate-300 border-slate-500/30', 4),
  ('performance', 'Performance Issue', 'Slowness, high latency, freeze, or high memory usage', 'Gauge', '#a855f7', 'bg-purple-500/15 text-purple-300 border-purple-500/30', 5),
  ('payment', 'Payment Issue', 'Fiat deposit, card charge, withdrawal, or gateway issue', 'CreditCard', '#10b981', 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', 6),
  ('wallet', 'Wallet Issue', 'Balance mismatch, asset transfer, or ledger dispute', 'Wallet', '#6366f1', 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', 7),
  ('chat', 'Chat Issue', 'Message delivery, media attachment, or socket disconnect', 'MessageCircle', '#06b6d4', 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', 8),
  ('community', 'Community Feed Issue', 'Feed loading, post reaction, or comment error', 'Globe', '#f97316', 'bg-orange-500/15 text-orange-300 border-orange-500/30', 9),
  ('security', 'Security Concern', 'Vulnerability, auth anomaly, or privacy concern', 'ShieldAlert', '#dc2626', 'bg-red-600/20 text-red-300 border-red-600/40', 10)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color_hex = EXCLUDED.color_hex,
  badge_color_class = EXCLUDED.badge_color_class;

-- 2. Main Feedback Reports Table
CREATE TABLE IF NOT EXISTS feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number SERIAL UNIQUE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  category_id text REFERENCES feedback_categories(id) DEFAULT 'general',
  type text NOT NULL CHECK (type IN ('bug', 'feature', 'improvement', 'general', 'crash', 'security')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'in_progress', 'testing', 'resolved', 'closed', 'rejected', 'duplicate')),
  roadmap_status text CHECK (roadmap_status IN ('planned', 'under_review', 'in_progress', 'released', 'declined')),
  
  title text NOT NULL,
  description text NOT NULL,
  reproduction_steps text[],
  expected_behavior text,
  actual_behavior text,
  
  -- AI Assistance metadata
  ai_generated_title text,
  ai_suggested_category text,
  ai_confidence_score numeric(3,2),
  ai_reproduction_steps text[],
  spam_score numeric(3,2) DEFAULT 0.00,

  -- Duplicate tracking
  is_duplicate boolean DEFAULT false,
  duplicate_of_id uuid REFERENCES feedback_reports(id) ON DELETE SET NULL,
  
  -- Release & Version Management
  introduced_in_version text DEFAULT 'v1.0.5',
  fixed_in_version text,
  is_regression boolean DEFAULT false,
  is_hotfix boolean DEFAULT false,

  -- Developer & Assignment details
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes text,
  internal_notes text,
  tags text[] DEFAULT '{}',
  
  -- Metrics
  vote_count int DEFAULT 0,
  view_count int DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- 3. Granular Ratings Table
CREATE TABLE IF NOT EXISTS feedback_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES feedback_reports(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  overall_experience int CHECK (overall_experience BETWEEN 1 AND 5),
  performance int CHECK (performance BETWEEN 1 AND 5),
  design int CHECK (design BETWEEN 1 AND 5),
  ease_of_use int CHECK (ease_of_use BETWEEN 1 AND 5),
  reliability int CHECK (reliability BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT now()
);

-- 4. Diagnostics & Telemetry Data
CREATE TABLE IF NOT EXISTS feedback_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES feedback_reports(id) ON DELETE CASCADE UNIQUE,
  app_version text,
  build_number text,
  device_model text,
  screen_resolution text,
  viewport_size text,
  browser_name text,
  browser_version text,
  operating_system text,
  os_version text,
  session_id text,
  current_route text,
  last_action text,
  network_type text,
  is_online boolean DEFAULT true,
  api_trace_id text,
  request_id text,
  feature_flags jsonb DEFAULT '{}'::jsonb,
  locale text,
  timezone text,

  -- Context Specific Enriched Data
  wallet_context jsonb DEFAULT '{}'::jsonb,
  chat_context jsonb DEFAULT '{}'::jsonb,
  community_context jsonb DEFAULT '{}'::jsonb,

  -- Error & Stack Trace details
  error_message text,
  error_name text,
  stack_trace text,
  console_logs jsonb DEFAULT '[]'::jsonb,
  failed_api_endpoint text,
  http_status int,
  request_duration_ms int,
  
  created_at timestamptz DEFAULT now()
);

-- 5. Attachments Table
CREATE TABLE IF NOT EXISTS feedback_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES feedback_reports(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('screenshot', 'recording', 'image', 'pdf')),
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL,
  storage_url text NOT NULL,
  thumbnail_url text,
  is_compressed boolean DEFAULT false,
  original_size_bytes bigint,
  created_at timestamptz DEFAULT now()
);

-- 6. Discussion Comments & Developer Notes Table
CREATE TABLE IF NOT EXISTS feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES feedback_reports(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  is_internal boolean DEFAULT false, -- Internal dev note vs user reply
  mentioned_user_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 7. Audit Status & Assignment History
CREATE TABLE IF NOT EXISTS feedback_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES feedback_reports(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  previous_status text,
  new_status text,
  previous_priority text,
  new_priority text,
  previous_assignee uuid REFERENCES profiles(id) ON DELETE SET NULL,
  new_assignee uuid REFERENCES profiles(id) ON DELETE SET NULL,
  change_reason text,
  created_at timestamptz DEFAULT now()
);

-- 8. Feature Request Voting Table
CREATE TABLE IF NOT EXISTS feedback_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES feedback_reports(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (report_id, user_id)
);

-- 9. Watchers Table
CREATE TABLE IF NOT EXISTS feedback_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES feedback_reports(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (report_id, user_id)
);

-- 10. Beta Tester Program Management Tables
CREATE TABLE IF NOT EXISTS beta_testers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'suspended')),
  testing_group text DEFAULT 'general' CHECK (testing_group IN ('general', 'fintech_vip', 'early_adopters', 'security_auditors')),
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  reports_submitted int DEFAULT 0,
  last_active_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beta_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  target_group text DEFAULT 'all',
  version_target text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 11. Indexes for Maximum Performance
CREATE INDEX IF NOT EXISTS idx_feedback_reports_status ON feedback_reports(status);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_priority ON feedback_reports(priority);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_category ON feedback_reports(category_id);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_user ON feedback_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_assigned ON feedback_reports(assigned_to);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_created ON feedback_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_roadmap ON feedback_reports(roadmap_status);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_vote ON feedback_reports(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_attachments_report ON feedback_attachments(report_id);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_report ON feedback_comments(report_id);
CREATE INDEX IF NOT EXISTS idx_feedback_telemetry_route ON feedback_telemetry(current_route);

-- 12. RLS Security Policies
ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_announcements ENABLE ROW LEVEL SECURITY;

-- Permissive policies for read/write based on ownership & admin status
CREATE POLICY "Public & Users view reports" ON feedback_reports
  FOR SELECT USING (true);

CREATE POLICY "Users insert reports" ON feedback_reports
  FOR INSERT WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid());

CREATE POLICY "Users & Admins update reports" ON feedback_reports
  FOR UPDATE USING (
    user_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'developer', 'support'))
  );

CREATE POLICY "Users insert telemetry" ON feedback_telemetry
  FOR INSERT WITH CHECK (true);

CREATE POLICY "View telemetry" ON feedback_telemetry
  FOR SELECT USING (true);

CREATE POLICY "Users & Admins comments" ON feedback_comments
  FOR ALL USING (
    NOT is_internal 
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'developer', 'support'))
  );

CREATE POLICY "Votes access" ON feedback_votes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Watchers access" ON feedback_watchers
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Beta testers view" ON beta_testers
  FOR ALL USING (
    user_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'developer'))
  );
