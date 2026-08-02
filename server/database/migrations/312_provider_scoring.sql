-- 312_provider_scoring.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Provider Recommendation Scoring Weights & Configuration

CREATE TABLE IF NOT EXISTS public.provider_scoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL UNIQUE,
  success_weight NUMERIC(3,2) NOT NULL DEFAULT 0.35,
  latency_weight NUMERIC(3,2) NOT NULL DEFAULT 0.20,
  fee_weight NUMERIC(3,2) NOT NULL DEFAULT 0.20,
  liquidity_weight NUMERIC(3,2) NOT NULL DEFAULT 0.15,
  circuit_weight NUMERIC(3,2) NOT NULL DEFAULT 0.10,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations for pre-existing table instances
ALTER TABLE public.provider_scoring_config ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE public.provider_scoring_config ADD COLUMN IF NOT EXISTS success_weight NUMERIC(3,2) DEFAULT 0.35;
ALTER TABLE public.provider_scoring_config ADD COLUMN IF NOT EXISTS latency_weight NUMERIC(3,2) DEFAULT 0.20;
ALTER TABLE public.provider_scoring_config ADD COLUMN IF NOT EXISTS fee_weight NUMERIC(3,2) DEFAULT 0.20;
ALTER TABLE public.provider_scoring_config ADD COLUMN IF NOT EXISTS liquidity_weight NUMERIC(3,2) DEFAULT 0.15;
ALTER TABLE public.provider_scoring_config ADD COLUMN IF NOT EXISTS circuit_weight NUMERIC(3,2) DEFAULT 0.10;

-- Safe Unique Constraint Addition for ON CONFLICT (provider) DO NOTHING
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_provider_scoring_provider'
  ) THEN
    ALTER TABLE public.provider_scoring_config ADD CONSTRAINT uq_provider_scoring_provider UNIQUE (provider);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Scoring Configurations
INSERT INTO public.provider_scoring_config (provider, success_weight, latency_weight, fee_weight, liquidity_weight, circuit_weight)
VALUES
  ('fincra', 0.35, 0.20, 0.20, 0.15, 0.10),
  ('anchor', 0.35, 0.20, 0.20, 0.15, 0.10),
  ('conduit', 0.35, 0.20, 0.20, 0.15, 0.10)
ON CONFLICT (provider) DO NOTHING;
