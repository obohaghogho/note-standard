-- 329_rollbacks.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Production Automated Rollback History

CREATE TABLE IF NOT EXISTS public.rollbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_version VARCHAR(50) NOT NULL,
  trigger_reason TEXT NOT NULL,
  metrics_snapshot JSONB DEFAULT '{}'::jsonb,
  initiated_by VARCHAR(100) NOT NULL DEFAULT 'AUTOMATED_ROLLBACK_ENGINE',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.rollbacks ADD COLUMN IF NOT EXISTS trigger_reason TEXT;

-- Indices
CREATE INDEX IF NOT EXISTS idx_rollbacks_exec ON public.rollbacks(executed_at DESC);
