-- 324_feature_flags.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Production Feature Flags & Dynamic Target Control

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100),
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

-- Safe Schema Alterations for pre-existing table instances
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS key VARCHAR(100);
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS feature_key VARCHAR(100);
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS rollout_percentage NUMERIC(5,2) DEFAULT 100.00;

-- Safely attempt DROP NOT NULL on legacy key column
DO $$ 
BEGIN
  ALTER TABLE public.feature_flags ALTER COLUMN key DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

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

-- Seed Default Feature Flags with legacy key column compatibility
INSERT INTO public.feature_flags (key, feature_key, enabled, rollout_percentage)
VALUES
  ('BANKING_ENABLED', 'BANKING_ENABLED', true, 100.00),
  ('INSTANT_WITHDRAWALS', 'INSTANT_WITHDRAWALS', true, 100.00),
  ('FX_ENGINE', 'FX_ENGINE', true, 100.00),
  ('ANCHOR_PROVIDER', 'ANCHOR_PROVIDER', true, 100.00),
  ('CONDUIT_PROVIDER', 'CONDUIT_PROVIDER', true, 100.00),
  ('AUTO_REBALANCING', 'AUTO_REBALANCING', true, 100.00),
  ('TREASURY_AUTOMATION', 'TREASURY_AUTOMATION', true, 100.00),
  ('SMART_ROUTING', 'SMART_ROUTING', true, 100.00),
  ('WEBHOOK_PROCESSING', 'WEBHOOK_PROCESSING', true, 100.00),
  ('AUTO_FAILOVER', 'AUTO_FAILOVER', true, 100.00)
ON CONFLICT DO NOTHING;
