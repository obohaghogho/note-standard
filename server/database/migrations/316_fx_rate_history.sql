-- 316_fx_rate_history.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Market FX Rate History & Provider Quotation Audit Trail

CREATE TABLE IF NOT EXISTS public.fx_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair VARCHAR(20) NOT NULL,
  bid NUMERIC(20,8) NOT NULL,
  ask NUMERIC(20,8) NOT NULL,
  mid NUMERIC(20,8) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'fincra',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.fx_rate_history ADD COLUMN IF NOT EXISTS mid NUMERIC(20,8);

-- Indices
CREATE INDEX IF NOT EXISTS idx_fx_history_pair_time ON public.fx_rate_history(pair, captured_at DESC);
