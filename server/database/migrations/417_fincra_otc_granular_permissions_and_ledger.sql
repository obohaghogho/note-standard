-- =============================================================================
-- Migration 417: Granular OTC Operator Permissions & OTC Ledger Table
-- =============================================================================
-- SAFETY CONTRACT:
--   - Additive & Backward Compatible.
--   - Adds can_confirm_otc_funding column to profiles table for granular RBAC.
--   - Creates fincra_otc_ledger_journals table for immutable double-entry OTC asset tracking.
-- =============================================================================

BEGIN;

-- 1. Add Granular OTC Operator Permission Column to Profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_confirm_otc_funding BOOLEAN DEFAULT false;

-- 2. Create Fincra OTC Asset Journals Table for Immutable Double-Entry Asset Tracking
CREATE TABLE IF NOT EXISTS public.fincra_otc_ledger_journals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_reference VARCHAR(100) NOT NULL UNIQUE,
  otc_reference        VARCHAR(100) NOT NULL,
  operator_id          UUID NOT NULL REFERENCES public.profiles(id),
  source_asset         VARCHAR(10) NOT NULL,
  amount               NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  debit_account        VARCHAR(100) NOT NULL,
  credit_account       VARCHAR(100) NOT NULL,
  debit_amount         NUMERIC(20, 8) NOT NULL,
  credit_amount        NUMERIC(20, 8) NOT NULL,
  is_balanced          BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_fincra_otc_ledger_tx_ref ON public.fincra_otc_ledger_journals(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_fincra_otc_ledger_operator ON public.fincra_otc_ledger_journals(operator_id);

COMMIT;
