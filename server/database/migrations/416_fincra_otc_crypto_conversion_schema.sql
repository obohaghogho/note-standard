-- =============================================================================
-- Migration 416: Fincra Manual OTC Crypto Conversion Schema Hardening
-- =============================================================================
-- SAFETY CONTRACT:
--   - Additive & Backward Compatible.
--   - Drops overly-restrictive CHECK constraint on fincra_transactions.status
--     to accommodate the full OTC conversion state machine.
--   - Adds nullable helper columns for manual OTC funding, quotes, and audit.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Relax fincra_transactions status check constraint
-- ---------------------------------------------------------------------------
ALTER TABLE public.fincra_transactions
  DROP CONSTRAINT IF EXISTS fincra_transactions_status_check;

-- ---------------------------------------------------------------------------
-- 2. Add OTC Conversion Helper Columns (if not exists)
-- ---------------------------------------------------------------------------
ALTER TABLE public.fincra_transactions
  ADD COLUMN IF NOT EXISTS source_asset            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS destination_currency    VARCHAR(10),
  ADD COLUMN IF NOT EXISTS quote_reference         VARCHAR(128),
  ADD COLUMN IF NOT EXISTS quote_expires_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otc_reference           VARCHAR(128),
  ADD COLUMN IF NOT EXISTS external_reference      VARCHAR(128),
  ADD COLUMN IF NOT EXISTS confirmed_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otc_notes               TEXT,
  ADD COLUMN IF NOT EXISTS evidence_reference      VARCHAR(256),
  ADD COLUMN IF NOT EXISTS conversion_reference    VARCHAR(128),
  ADD COLUMN IF NOT EXISTS conversion_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversion_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reserved_crypto_amount  NUMERIC(20, 8) DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. Add Indexes for Performance & Queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fincra_txn_source_asset    ON public.fincra_transactions(source_asset);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_dest_curr       ON public.fincra_transactions(destination_currency);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_quote_ref       ON public.fincra_transactions(quote_reference);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_otc_ref         ON public.fincra_transactions(otc_reference);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_confirmed_by     ON public.fincra_transactions(confirmed_by);

COMMIT;
