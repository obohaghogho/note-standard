-- Migration: v2.5 — Operations Dashboard & Hardening
-- Adds health tracking, admin audit logs, feature flags, and roles.

-- ============================================================
-- 1. ADMIN ROLES
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_role text 
  CHECK (admin_role IN ('super_admin', 'platform_admin', 'support_engineer', 'moderator'));

-- ============================================================
-- 2. SYSTEM HEALTH METRICS
-- 5-minute rollups for the Operations Dashboard.
-- ============================================================
CREATE TABLE IF NOT EXISTS system_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measured_at timestamptz NOT NULL DEFAULT now(),
  
  -- API Health
  avg_api_latency_ms integer DEFAULT 0,
  p95_api_latency_ms integer DEFAULT 0,
  error_rate_pct numeric DEFAULT 0,
  
  -- Database Health
  active_connections integer DEFAULT 0,
  cache_hit_rate_pct numeric DEFAULT 0,
  avg_query_latency_ms integer DEFAULT 0,
  
  -- AI Health (Groq)
  avg_ai_latency_ms integer DEFAULT 0,
  ai_timeout_rate_pct numeric DEFAULT 0,
  ai_token_usage_total integer DEFAULT 0,
  
  -- Background Jobs & Queues
  pending_jobs_count integer DEFAULT 0,
  failed_jobs_count integer DEFAULT 0,
  dlq_count integer DEFAULT 0,  -- Dead-Letter Queue depth
  avg_job_processing_ms integer DEFAULT 0,

  UNIQUE(measured_at)
);

CREATE INDEX IF NOT EXISTS idx_system_health_time ON system_health_metrics(measured_at DESC);

-- ============================================================
-- 3. ADMIN AUDIT LOGS (Table already exists from 013_enhanced_chat_features.sql)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_admin_audit ON admin_audit_logs(admin_id, created_at DESC);

-- ============================================================
-- 4. GLOBAL FEATURE FLAGS
-- Controllable from the Operations Dashboard without deployment.
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_feature_flags (
  flag_key text PRIMARY KEY,
  is_enabled boolean DEFAULT false,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

INSERT INTO platform_feature_flags (flag_key, is_enabled, description) VALUES
  ('enable_ai_tutor', true, 'Global toggle for AI Tutor features'),
  ('enable_marketplace', true, 'Global toggle for Knowledge Commerce'),
  ('enable_learning_mode', true, 'Global toggle for Spaced Repetition study sessions'),
  ('enable_voice_rooms', false, 'Experimental WebRTC voice rooms'),
  ('enable_diagnostics_panel', false, 'Show detailed debug info to super_admins in client')
ON CONFLICT (flag_key) DO NOTHING;

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================
ALTER TABLE system_health_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins can view health" ON system_health_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND admin_role IS NOT NULL)
);

ALTER TABLE platform_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read for feature flags" ON platform_feature_flags FOR SELECT USING (true);
CREATE POLICY "Only platform admins manage flags" ON platform_feature_flags FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND admin_role IN ('super_admin', 'platform_admin'))
);
