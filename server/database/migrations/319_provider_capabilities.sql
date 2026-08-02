-- 319_provider_capabilities.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Published Provider Capabilities Matrix per Currency & Payment Rail

CREATE TABLE IF NOT EXISTS public.provider_capabilities_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  payment_rail VARCHAR(50) NOT NULL,
  operation VARCHAR(50) NOT NULL,
  is_supported BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prov_cap_matrix UNIQUE(provider, currency, payment_rail, operation)
);

-- Safe Schema Alterations
ALTER TABLE public.provider_capabilities_matrix ADD COLUMN IF NOT EXISTS is_supported BOOLEAN DEFAULT true;

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_prov_cap_matrix'
  ) THEN
    ALTER TABLE public.provider_capabilities_matrix ADD CONSTRAINT uq_prov_cap_matrix UNIQUE (provider, currency, payment_rail, operation);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Capabilities
INSERT INTO public.provider_capabilities_matrix (provider, currency, payment_rail, operation, is_supported)
VALUES
  ('fincra', 'NGN', 'BANK_TRANSFER', 'deposit', true),
  ('fincra', 'USD', 'CARD', 'deposit', true),
  ('anchor', 'NGN', 'BANK_TRANSFER', 'deposit', true),
  ('anchor', 'USD', 'WIRE', 'deposit', true),
  ('conduit', 'USD', 'ACH', 'deposit', true),
  ('conduit', 'EUR', 'SEPA', 'deposit', true)
ON CONFLICT (provider, currency, payment_rail, operation) DO NOTHING;
