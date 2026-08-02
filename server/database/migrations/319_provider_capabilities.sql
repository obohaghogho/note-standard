-- 319_provider_capabilities.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Country + Currency + Direction + Payment Rail Capability Matrix
-- Official Fincra Support Matrix with Activation Status (ENABLED vs PENDING_APPROVAL)

CREATE TABLE IF NOT EXISTS public.provider_capabilities_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  country VARCHAR(10) NOT NULL DEFAULT 'NG',
  currency VARCHAR(10) NOT NULL,
  payment_rail VARCHAR(50) NOT NULL,
  direction VARCHAR(20) NOT NULL DEFAULT 'payin' CHECK (direction IN ('payin', 'payout')),
  operation VARCHAR(50) NOT NULL DEFAULT 'deposit',
  activation_status VARCHAR(30) NOT NULL DEFAULT 'ENABLED' CHECK (activation_status IN ('ENABLED', 'PENDING_APPROVAL', 'DISABLED', 'NOT_SUPPORTED')),
  is_supported BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prov_cap_matrix_v2 UNIQUE(provider, country, currency, payment_rail, direction)
);

-- Safe Schema Alterations for pre-existing table instances
ALTER TABLE public.provider_capabilities_matrix ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'NG';
ALTER TABLE public.provider_capabilities_matrix ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'payin';
ALTER TABLE public.provider_capabilities_matrix ADD COLUMN IF NOT EXISTS activation_status VARCHAR(30) DEFAULT 'ENABLED';
ALTER TABLE public.provider_capabilities_matrix ADD COLUMN IF NOT EXISTS is_supported BOOLEAN DEFAULT true;

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_prov_cap_matrix_v2'
  ) THEN
    ALTER TABLE public.provider_capabilities_matrix ADD CONSTRAINT uq_prov_cap_matrix_v2 UNIQUE (provider, country, currency, payment_rail, direction);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Fincra Official Capabilities Matrix with Country, Direction, and Activation Status
INSERT INTO public.provider_capabilities_matrix (provider, country, currency, payment_rail, direction, operation, activation_status)
VALUES
  -- Nigeria (NGN)
  ('fincra', 'NG', 'NGN', 'CARDS', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'NG', 'NGN', 'BANK_TRANSFER', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'NG', 'NGN', 'PALMPAY_WALLET', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'NG', 'NGN', 'BANK_TRANSFER', 'payout', 'withdraw', 'ENABLED'),

  -- Uganda (UGX)
  ('fincra', 'UG', 'UGX', 'MTN_MOBILE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'UG', 'UGX', 'AIRTEL_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'UG', 'UGX', 'MTN_MOBILE_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'UG', 'UGX', 'AIRTEL_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'UG', 'UGX', 'BANK_TRANSFER', 'payout', 'withdraw', 'ENABLED'),

  -- South Africa (ZAR)
  ('fincra', 'ZA', 'ZAR', 'CARDS', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'ZA', 'ZAR', 'EFT', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'ZA', 'ZAR', 'BANK_TRANSFER', 'payout', 'withdraw', 'ENABLED'),

  -- Ghana (GHS)
  ('fincra', 'GH', 'GHS', 'MTN_MOBILE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'GH', 'GHS', 'AIRTEL_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'GH', 'GHS', 'VODAFONE_CASH', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'GH', 'GHS', 'MTN_MOBILE_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'GH', 'GHS', 'AIRTEL_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'GH', 'GHS', 'VODAFONE_CASH', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'GH', 'GHS', 'BANK_TRANSFER', 'payout', 'withdraw', 'ENABLED'),

  -- Kenya (KES)
  ('fincra', 'KE', 'KES', 'MPESA', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'KE', 'KES', 'AIRTEL_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'KE', 'KES', 'MPESA', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'KE', 'KES', 'AIRTEL_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'KE', 'KES', 'BANK_TRANSFER', 'payout', 'withdraw', 'ENABLED'),

  -- Tanzania (TZS)
  ('fincra', 'TZ', 'TZS', 'TIGO_YAS', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'TZ', 'TZS', 'AIRTEL_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'TZ', 'TZS', 'VODACOM', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'TZ', 'TZS', 'HALOTEL', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'TZ', 'TZS', 'TIGO_YAS', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'TZ', 'TZS', 'AIRTEL_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'TZ', 'TZS', 'VODACOM', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'TZ', 'TZS', 'HALOTEL', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'TZ', 'TZS', 'BANK_TRANSFER', 'payout', 'withdraw', 'ENABLED'),

  -- Zambia (ZMW)
  ('fincra', 'ZM', 'ZMW', 'MTN_MOBILE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'ZM', 'ZMW', 'AIRTEL_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'ZM', 'ZMW', 'MTN_MOBILE_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'ZM', 'ZMW', 'AIRTEL_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'ZM', 'ZMW', 'ZAMTEL', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'ZM', 'ZMW', 'BANK_TRANSFER', 'payout', 'withdraw', 'ENABLED'),

  -- Burkina Faso (BF - XOF)
  ('fincra', 'BF', 'XOF', 'MOOV_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'BF', 'XOF', 'ORANGE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'BF', 'XOF', 'CORIS', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'BF', 'XOF', 'MOOV_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'BF', 'XOF', 'ORANGE_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'BF', 'XOF', 'CORIS', 'payout', 'withdraw', 'ENABLED'),

  -- Senegal (SN - XOF)
  ('fincra', 'SN', 'XOF', 'ORANGE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'SN', 'XOF', 'FREE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'SN', 'XOF', 'MOOV_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'SN', 'XOF', 'WAVE', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'SN', 'XOF', 'ORANGE_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'SN', 'XOF', 'FREEMONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'SN', 'XOF', 'WAVE', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'SN', 'XOF', 'BANK_TRANSFER', 'payout', 'withdraw', 'ENABLED'),

  -- Ivory Coast (CI - XOF)
  ('fincra', 'CI', 'XOF', 'MTN_MOBILE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'CI', 'XOF', 'MOOV_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'CI', 'XOF', 'ORANGE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'CI', 'XOF', 'WAVE', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'CI', 'XOF', 'MTN_MOBILE_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'CI', 'XOF', 'MOOV_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'CI', 'XOF', 'ORANGE_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'CI', 'XOF', 'WAVE', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'CI', 'XOF', 'BANK_TRANSFER', 'payout', 'withdraw', 'ENABLED'),

  -- Cameroon (CM - XAF)
  ('fincra', 'CM', 'XAF', 'MTN_MOBILE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'CM', 'XAF', 'ORANGE_MONEY', 'payin', 'deposit', 'ENABLED'),
  ('fincra', 'CM', 'XAF', 'MTN_MOBILE_MONEY', 'payout', 'withdraw', 'ENABLED'),
  ('fincra', 'CM', 'XAF', 'ORANGE_MONEY', 'payout', 'withdraw', 'ENABLED'),

  -- Pending Merchant Account Approvals (EUR, GBP, USD Collections)
  ('fincra', 'GB', 'GBP', 'FASTER_PAYMENTS', 'payin', 'deposit', 'PENDING_APPROVAL'),
  ('fincra', 'EU', 'EUR', 'SEPA', 'payin', 'deposit', 'PENDING_APPROVAL'),
  ('fincra', 'US', 'USD', 'ACH', 'payin', 'deposit', 'PENDING_APPROVAL'),
  ('fincra', 'US', 'USD', 'WIRE', 'payin', 'deposit', 'PENDING_APPROVAL'),

  -- Partner Provider Defaults (Anchor & Conduit)
  ('anchor', 'NG', 'NGN', 'BANK_TRANSFER', 'payin', 'deposit', 'ENABLED'),
  ('anchor', 'US', 'USD', 'WIRE', 'payin', 'deposit', 'ENABLED'),
  ('conduit', 'US', 'USD', 'ACH', 'payin', 'deposit', 'ENABLED'),
  ('conduit', 'EU', 'EUR', 'SEPA', 'payin', 'deposit', 'ENABLED')
ON CONFLICT (provider, country, currency, payment_rail, direction) DO NOTHING;
