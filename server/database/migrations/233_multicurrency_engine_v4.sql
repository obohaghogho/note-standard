-- Migration: 233_multicurrency_engine_v4.sql
-- NoteStandard Financial Platform v4
-- Additive only — never drops existing tables or columns.
--
-- Creates:
--   financial_audit_log  — immutable financial audit trail
--   fx_quotes            — 5-minute FX quote locks
--   fx_rates_lkg         — last-known-good exchange rate store
--
-- Extends existing tables:
--   ledger_entries       — adds double-entry columns (correlation_id, direction, etc.)
--   transactions         — adds 4-currency hierarchy columns

BEGIN;

-- ─── 1. Financial Audit Log ────────────────────────────────────────────────
-- Immutable record of every financial action: who, what, gateway, outcome.

CREATE TABLE IF NOT EXISTS public.financial_audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action              TEXT NOT NULL,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  service             TEXT,
  provider            TEXT,
  reference           TEXT,
  provider_ref        TEXT,
  requested_currency  TEXT,
  requested_amount    NUMERIC(20, 8),
  gateway_currency    TEXT,
  gateway_amount      NUMERIC(20, 8),
  exchange_rate       NUMERIC(20, 8),
  outcome             TEXT NOT NULL DEFAULT 'PENDING',
  failure_reason      TEXT,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable: insert-only for application, admin-read
ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_insert_only" ON public.financial_audit_log;
CREATE POLICY "audit_log_insert_only" ON public.financial_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "audit_log_admin_read" ON public.financial_audit_log;
CREATE POLICY "audit_log_admin_read" ON public.financial_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id   ON public.financial_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_reference  ON public.financial_audit_log(reference);
CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON public.financial_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.financial_audit_log(created_at DESC);


-- ─── 2. Extend Existing ledger_entries Table ───────────────────────────────
-- Migration 072 created ledger_entries with a different schema.
-- We ADD new double-entry columns without touching existing ones.

-- correlation_id: links a DEBIT + CREDIT pair
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS correlation_id      UUID,
  ADD COLUMN IF NOT EXISTS direction           TEXT
    CHECK (direction IS NULL OR direction IN ('DEBIT', 'CREDIT')),
  ADD COLUMN IF NOT EXISTS description         TEXT,
  ADD COLUMN IF NOT EXISTS provider            TEXT,
  ADD COLUMN IF NOT EXISTS requested_currency  TEXT,
  ADD COLUMN IF NOT EXISTS requested_amount    NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC(20, 8) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ledger_currency     TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS metadata            JSONB DEFAULT '{}';

-- Add indexes for new columns only
CREATE INDEX IF NOT EXISTS idx_ledger_correlation_id
  ON public.ledger_entries(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- idx_ledger_wallet_id and idx_ledger_reference already exist from migration 072


-- ─── 3. FX Quotes ──────────────────────────────────────────────────────────
-- Stores 5-minute signed FX quotes for checkout rate locking.

CREATE TABLE IF NOT EXISTS public.fx_quotes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id         TEXT UNIQUE NOT NULL,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_currency    TEXT NOT NULL,
  to_currency      TEXT NOT NULL,
  original_amount  NUMERIC(20, 8) NOT NULL,
  converted_amount NUMERIC(20, 8) NOT NULL,
  exchange_rate    NUMERIC(20, 8) NOT NULL,
  fx_provider      TEXT,
  is_conversion    BOOLEAN DEFAULT TRUE,
  expires_at       TIMESTAMPTZ NOT NULL,
  used             BOOLEAN DEFAULT FALSE,
  consumed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fx_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fx_quotes_user_read" ON public.fx_quotes;
CREATE POLICY "fx_quotes_user_read" ON public.fx_quotes
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "fx_quotes_insert" ON public.fx_quotes;
CREATE POLICY "fx_quotes_insert" ON public.fx_quotes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "fx_quotes_update" ON public.fx_quotes;
CREATE POLICY "fx_quotes_update" ON public.fx_quotes
  FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS idx_fx_quotes_quote_id   ON public.fx_quotes(quote_id);
CREATE INDEX IF NOT EXISTS idx_fx_quotes_user_id    ON public.fx_quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_fx_quotes_expires_at ON public.fx_quotes(expires_at);


-- ─── 4. FX Rates Last Known Good ───────────────────────────────────────────
-- Persistent fallback exchange rates updated by the FXProviderChain.

CREATE TABLE IF NOT EXISTS public.fx_rates_lkg (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency   TEXT NOT NULL,
  to_currency     TEXT NOT NULL,
  rate            NUMERIC(20, 8) NOT NULL,
  source          TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_currency, to_currency)
);

CREATE INDEX IF NOT EXISTS idx_fx_lkg_pair ON public.fx_rates_lkg(from_currency, to_currency);


-- ─── 5. Extend transactions Table: 4-Currency Hierarchy ───────────────────
-- Adds the v4 multi-currency tracking columns without altering existing ones.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS requested_currency  TEXT,
  ADD COLUMN IF NOT EXISTS requested_amount    NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS gateway_currency    TEXT,
  ADD COLUMN IF NOT EXISTS gateway_amount      NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS settlement_currency TEXT,
  ADD COLUMN IF NOT EXISTS ledger_currency     TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC(20, 8) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fx_provider         TEXT,
  ADD COLUMN IF NOT EXISTS provider_ref        TEXT;

COMMIT;
