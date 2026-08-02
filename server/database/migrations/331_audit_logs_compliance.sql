-- 331_audit_logs_compliance.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Tamper-Evident Administrative Audit Log & Compliance Repository

CREATE TABLE IF NOT EXISTS public.audit_logs_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  ip_address VARCHAR(50) DEFAULT '127.0.0.1',
  details JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.audit_logs_compliance ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;

-- Indices
CREATE INDEX IF NOT EXISTS idx_audit_user_action ON public.audit_logs_compliance(user_id, action, recorded_at DESC);
