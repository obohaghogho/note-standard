-- 340_developer_api_keys.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Developer Public API Keys & Client Credentials

CREATE TABLE IF NOT EXISTS public.developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(100) NOT NULL UNIQUE,
  api_key_hash VARCHAR(128) NOT NULL,
  workspace_id UUID DEFAULT NULL,
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.developer_api_keys ADD COLUMN IF NOT EXISTS client_id VARCHAR(100);

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_dev_keys_client_id'
  ) THEN
    ALTER TABLE public.developer_api_keys ADD CONSTRAINT uq_dev_keys_client_id UNIQUE (client_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_dev_keys_client ON public.developer_api_keys(client_id);
