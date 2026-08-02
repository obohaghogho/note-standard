-- 319_provider_capabilities.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Published Provider Capabilities Matrix per Currency & Payment Rail
-- Official Fincra Support Matrix Updated

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

-- Seed Fincra Official Supported Currencies, Payment Types & Schemes Matrix
INSERT INTO public.provider_capabilities_matrix (provider, currency, payment_rail, operation, is_supported)
VALUES
  -- NGN (Nigeria)
  ('fincra', 'NGN', 'CARDS', 'deposit', true),
  ('fincra', 'NGN', 'BANK_TRANSFER', 'deposit', true),
  ('fincra', 'NGN', 'PALMPAY_WALLET', 'deposit', true),
  ('fincra', 'NGN', 'BANK_TRANSFER', 'withdraw', true),

  -- UGX (Uganda)
  ('fincra', 'UGX', 'MTN_MOBILE_MONEY', 'deposit', true),
  ('fincra', 'UGX', 'AIRTEL_MONEY', 'deposit', true),
  ('fincra', 'UGX', 'MTN_MOBILE_MONEY', 'withdraw', true),
  ('fincra', 'UGX', 'AIRTEL_MONEY', 'withdraw', true),
  ('fincra', 'UGX', 'BANK_TRANSFER', 'withdraw', true),

  -- ZAR (South Africa)
  ('fincra', 'ZAR', 'CARDS', 'deposit', true),
  ('fincra', 'ZAR', 'EFT', 'deposit', true),
  ('fincra', 'ZAR', 'BANK_TRANSFER', 'withdraw', true),

  -- GHS (Ghana)
  ('fincra', 'GHS', 'MTN_MOBILE_MONEY', 'deposit', true),
  ('fincra', 'GHS', 'AIRTEL_MONEY', 'deposit', true),
  ('fincra', 'GHS', 'VODAFONE_CASH', 'deposit', true),
  ('fincra', 'GHS', 'MTN_MOBILE_MONEY', 'withdraw', true),
  ('fincra', 'GHS', 'AIRTEL_MONEY', 'withdraw', true),
  ('fincra', 'GHS', 'VODAFONE_CASH', 'withdraw', true),
  ('fincra', 'GHS', 'BANK_TRANSFER', 'withdraw', true),

  -- KES (Kenya)
  ('fincra', 'KES', 'MPESA', 'deposit', true),
  ('fincra', 'KES', 'AIRTEL_MONEY', 'deposit', true),
  ('fincra', 'KES', 'MPESA', 'withdraw', true),
  ('fincra', 'KES', 'AIRTEL_MONEY', 'withdraw', true),
  ('fincra', 'KES', 'BANK_TRANSFER', 'withdraw', true),

  -- TZS (Tanzania)
  ('fincra', 'TZS', 'TIGO_YAS', 'deposit', true),
  ('fincra', 'TZS', 'AIRTEL_MONEY', 'deposit', true),
  ('fincra', 'TZS', 'VODACOM', 'deposit', true),
  ('fincra', 'TZS', 'HALOTEL', 'deposit', true),
  ('fincra', 'TZS', 'TIGO_YAS', 'withdraw', true),
  ('fincra', 'TZS', 'AIRTEL_MONEY', 'withdraw', true),
  ('fincra', 'TZS', 'VODACOM', 'withdraw', true),
  ('fincra', 'TZS', 'HALOTEL', 'withdraw', true),
  ('fincra', 'TZS', 'BANK_TRANSFER', 'withdraw', true),

  -- ZMW (Zambia)
  ('fincra', 'ZMW', 'MTN_MOBILE_MONEY', 'deposit', true),
  ('fincra', 'ZMW', 'AIRTEL_MONEY', 'deposit', true),
  ('fincra', 'ZMW', 'MTN_MOBILE_MONEY', 'withdraw', true),
  ('fincra', 'ZMW', 'AIRTEL_MONEY', 'withdraw', true),
  ('fincra', 'ZMW', 'ZAMTEL', 'withdraw', true),
  ('fincra', 'ZMW', 'BANK_TRANSFER', 'withdraw', true),

  -- XOF (Burkina Faso, Senegal, Ivory Coast)
  ('fincra', 'XOF', 'ORANGE_MONEY', 'deposit', true),
  ('fincra', 'XOF', 'MOOV_MONEY', 'deposit', true),
  ('fincra', 'XOF', 'WAVE', 'deposit', true),
  ('fincra', 'XOF', 'FREE_MONEY', 'deposit', true),
  ('fincra', 'XOF', 'CORIS', 'deposit', true),
  ('fincra', 'XOF', 'ORANGE_MONEY', 'withdraw', true),
  ('fincra', 'XOF', 'MOOV_MONEY', 'withdraw', true),
  ('fincra', 'XOF', 'WAVE', 'withdraw', true),
  ('fincra', 'XOF', 'FREEMONEY', 'withdraw', true),
  ('fincra', 'XOF', 'CORIS', 'withdraw', true),
  ('fincra', 'XOF', 'BANK_TRANSFER', 'withdraw', true),

  -- XAF (Cameroon)
  ('fincra', 'XAF', 'MTN_MOBILE_MONEY', 'deposit', true),
  ('fincra', 'XAF', 'ORANGE_MONEY', 'deposit', true),
  ('fincra', 'XAF', 'MTN_MOBILE_MONEY', 'withdraw', true),
  ('fincra', 'XAF', 'ORANGE_MONEY', 'withdraw', true),

  -- Partner Provider Defaults (Anchor & Conduit)
  ('anchor', 'NGN', 'BANK_TRANSFER', 'deposit', true),
  ('anchor', 'USD', 'WIRE', 'deposit', true),
  ('conduit', 'USD', 'ACH', 'deposit', true),
  ('conduit', 'EUR', 'SEPA', 'deposit', true)
ON CONFLICT (provider, currency, payment_rail, operation) DO NOTHING;
