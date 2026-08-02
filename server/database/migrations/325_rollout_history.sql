-- 325_rollout_history.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Progressive Canary Rollout History

CREATE TABLE IF NOT EXISTS public.rollout_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(50) NOT NULL,
  environment VARCHAR(20) NOT NULL DEFAULT 'production',
  percentage NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NULL,
  rollback_reason TEXT DEFAULT NULL,
  initiated_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.rollout_history ADD COLUMN IF NOT EXISTS percentage NUMERIC(5,2) DEFAULT 1.00;

-- Indices
CREATE INDEX IF NOT EXISTS idx_rollout_ver_env ON public.rollout_history(version, environment);
