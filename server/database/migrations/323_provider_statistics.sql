-- 323_provider_statistics.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Historical Provider SLA & Uptime Statistics

CREATE TABLE IF NOT EXISTS public.provider_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL UNIQUE,
  total_requests INT NOT NULL DEFAULT 0,
  successful_requests INT NOT NULL DEFAULT 0,
  failed_requests INT NOT NULL DEFAULT 0,
  uptime_percentage NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  avg_latency_ms INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.provider_statistics ADD COLUMN IF NOT EXISTS total_requests INT DEFAULT 0;

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_prov_stats_provider'
  ) THEN
    ALTER TABLE public.provider_statistics ADD CONSTRAINT uq_prov_stats_provider UNIQUE (provider);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Provider Statistics Records
INSERT INTO public.provider_statistics (provider, total_requests, successful_requests, uptime_percentage, avg_latency_ms)
VALUES
  ('fincra', 1000, 998, 99.80, 120),
  ('anchor', 800, 796, 99.50, 140),
  ('conduit', 600, 597, 99.50, 160)
ON CONFLICT (provider) DO NOTHING;
