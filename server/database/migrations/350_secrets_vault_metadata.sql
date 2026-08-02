-- 350_secrets_vault_metadata.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- KMS/Vault Secrets Metadata & Multi-Region Replication Audit Repository

CREATE TABLE IF NOT EXISTS public.secrets_vault_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_path VARCHAR(150) NOT NULL UNIQUE,
  vault_engine VARCHAR(50) NOT NULL DEFAULT 'KMS_VAULT',
  version INT NOT NULL DEFAULT 1,
  region VARCHAR(20) NOT NULL DEFAULT 'us-east-1',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ROTATED')),
  last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.secrets_vault_metadata ADD COLUMN IF NOT EXISTS secret_path VARCHAR(150);

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_vault_secret_path'
  ) THEN
    ALTER TABLE public.secrets_vault_metadata ADD CONSTRAINT uq_vault_secret_path UNIQUE (secret_path);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_vault_secret_status ON public.secrets_vault_metadata(status, last_rotated_at DESC);
