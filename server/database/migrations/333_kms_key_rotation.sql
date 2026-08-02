-- 333_kms_key_rotation.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- KMS Encryption Key Rotation & Secrets Audit Repository

CREATE TABLE IF NOT EXISTS public.kms_key_rotation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_alias VARCHAR(100) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPRECATED')),
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.kms_key_rotation ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;

-- Indices
CREATE INDEX IF NOT EXISTS idx_kms_key_alias ON public.kms_key_rotation(key_alias, version DESC);
