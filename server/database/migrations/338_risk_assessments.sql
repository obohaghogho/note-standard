-- 338_risk_assessments.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Real-Time Risk Assessment Logs & Fraud Evaluation Repository

CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  recommendation VARCHAR(50) NOT NULL DEFAULT 'APPROVE' CHECK (recommendation IN ('APPROVE', 'FLAG_MANUAL_REVIEW', 'REJECT')),
  triggered_rules JSONB DEFAULT '[]'::jsonb,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.risk_assessments ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE public.risk_assessments ADD COLUMN IF NOT EXISTS recommendation VARCHAR(50) DEFAULT 'APPROVE';

-- Indices
CREATE INDEX IF NOT EXISTS idx_risk_assessments_user ON public.risk_assessments(user_id, assessed_at DESC);
