-- 318_provider_credentials.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Secure Provider Credentials & Encryption Metadata

CREATE TABLE IF NOT EXISTS public.provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL UNIQUE,
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  api_key_hash VARCHAR(128) NOT NULL,
  encrypted_credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.provider_credentials ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE public.provider_credentials ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'sandbox';
ALTER TABLE public.provider_credentials ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_provider_credentials_provider'
  ) THEN
    ALTER TABLE public.provider_credentials ADD CONSTRAINT uq_provider_credentials_provider UNIQUE (provider);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Provider Credentials
INSERT INTO public.provider_credentials (provider, environment, api_key_hash, encrypted_credentials)
VALUES
  ('fincra', 'sandbox', 'hash_fincra_123', '{"baseUrl": "https://sandboxapi.fincra.com"}'::jsonb),
  ('anchor', 'sandbox', 'hash_anchor_456', '{"baseUrl": "https://api.anchor.services"}'::jsonb),
  ('conduit', 'sandbox', 'hash_conduit_789', '{"baseUrl": "https://api.conduit.financial"}'::jsonb)
ON CONFLICT (provider) DO NOTHING;
