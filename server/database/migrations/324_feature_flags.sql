-- 324_feature_flags.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Production Feature Flags & Dynamic Target Control

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key VARCHAR(100) NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  rollout_percentage NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  workspace_id UUID DEFAULT NULL,
  country VARCHAR(10) DEFAULT NULL,
  currency VARCHAR(10) DEFAULT NULL,
  provider VARCHAR(50) DEFAULT NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS feature_key VARCHAR(100);
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS rollout_percentage NUMERIC(5,2) DEFAULT 100.00;

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_feature_flags_key'
  ) THEN
    ALTER TABLE public.feature_flags ADD CONSTRAINT uq_feature_flags_key UNIQUE (feature_key);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Feature Flags
INSERT INTO public.feature_flags (feature_key, enabled, rollout_percentage)
VALUES
  ('BANKING_ENABLED', true, 100.00),
  ('INSTANT_WITHDRAWALS', true, 100.00),
  ('FX_ENGINE', true, 100.00),
  ('ANCHOR_PROVIDER', true, 100.00),
  ('CONDUIT_PROVIDER', true, 100.00),
  ('AUTO_REBALANCING', true, 100.00),
  ('TREASURY_AUTOMATION', true, 100.00),
  ('SMART_ROUTING', true, 100.00),
  ('WEBHOOK_PROCESSING', true, 100.00),
  ('AUTO_FAILOVER', true, 100.00)
ON CONFLICT (feature_key) DO NOTHING;
