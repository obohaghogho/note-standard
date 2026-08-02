-- 307_provider_health.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Provider Health Telemetry & Real-Time Performance Tracking

CREATE TABLE IF NOT EXISTS public.provider_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL UNIQUE,
  provider_name VARCHAR(50),
  latency_ms INT NOT NULL DEFAULT 0,
  success_rate NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  consecutive_failures INT NOT NULL DEFAULT 0,
  consecutive_successes INT NOT NULL DEFAULT 0,
  last_success TIMESTAMPTZ DEFAULT NULL,
  last_failure TIMESTAMPTZ DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY' CHECK (status IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations for pre-existing and legacy table instances
ALTER TABLE public.provider_health ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE public.provider_health ADD COLUMN IF NOT EXISTS provider_name VARCHAR(50);
ALTER TABLE public.provider_health ADD COLUMN IF NOT EXISTS latency_ms INT DEFAULT 0;
ALTER TABLE public.provider_health ADD COLUMN IF NOT EXISTS success_rate NUMERIC(5,2) DEFAULT 100.00;
ALTER TABLE public.provider_health ADD COLUMN IF NOT EXISTS consecutive_failures INT DEFAULT 0;
ALTER TABLE public.provider_health ADD COLUMN IF NOT EXISTS consecutive_successes INT DEFAULT 0;
ALTER TABLE public.provider_health ADD COLUMN IF NOT EXISTS last_success TIMESTAMPTZ;
ALTER TABLE public.provider_health ADD COLUMN IF NOT EXISTS last_failure TIMESTAMPTZ;
ALTER TABLE public.provider_health ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'HEALTHY';

-- Safely attempt DROP NOT NULL on provider_name if not part of primary key
DO $$ 
BEGIN
  ALTER TABLE public.provider_health ALTER COLUMN provider_name DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Safe Unique Constraint Addition for ON CONFLICT (provider) DO NOTHING
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_provider_health_provider'
  ) THEN
    ALTER TABLE public.provider_health ADD CONSTRAINT uq_provider_health_provider UNIQUE (provider);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Providers with legacy compatibility for provider_name
INSERT INTO public.provider_health (provider, provider_name, latency_ms, success_rate, status)
VALUES
  ('fincra', 'fincra', 120, 100.00, 'HEALTHY'),
  ('anchor', 'anchor', 140, 100.00, 'HEALTHY'),
  ('conduit', 'conduit', 160, 100.00, 'HEALTHY')
ON CONFLICT DO NOTHING;

-- Indices
CREATE INDEX IF NOT EXISTS idx_provider_health_status ON public.provider_health(status);