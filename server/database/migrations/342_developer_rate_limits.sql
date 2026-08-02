-- 342_developer_rate_limits.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Developer API Endpoint Rate Limits per Tier

CREATE TABLE IF NOT EXISTS public.developer_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(100) NOT NULL UNIQUE,
  tier VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
  req_per_minute INT NOT NULL DEFAULT 60,
  req_per_hour INT NOT NULL DEFAULT 3600,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.developer_rate_limits ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'STANDARD';

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_dev_rate_limits_client'
  ) THEN
    ALTER TABLE public.developer_rate_limits ADD CONSTRAINT uq_dev_rate_limits_client UNIQUE (client_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_dev_rate_limits_client ON public.developer_rate_limits(client_id);
