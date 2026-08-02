-- 299_double_entry_ledger.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Immutable Append-Only Double-Entry Ledger System of Record

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_line_id UUID REFERENCES public.journal_lines(id) ON DELETE RESTRICT,
  wallet_account_id UUID REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  treasury_account_id UUID REFERENCES public.treasury_accounts(id) ON DELETE RESTRICT,
  transaction_id VARCHAR(100),
  payment_intent_id VARCHAR(100),
  provider_reference VARCHAR(100),
  currency VARCHAR(10) NOT NULL,
  amount NUMERIC(20,8) NOT NULL CHECK (amount > 0),
  direction VARCHAR(10) CHECK (direction IN ('DEBIT', 'CREDIT')),
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Safe Schema Alterations for existing table instances (e.g., from migration 072/164)
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS journal_line_id UUID REFERENCES public.journal_lines(id) ON DELETE RESTRICT;
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS wallet_account_id UUID REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS treasury_account_id UUID REFERENCES public.treasury_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(100);
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(100);
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS direction VARCHAR(10);
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ DEFAULT NOW();

-- Indices for rapid balance reconciliation and audit queries
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet ON public.ledger_entries(wallet_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_treasury ON public.ledger_entries(treasury_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_journal_line ON public.ledger_entries(journal_line_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx_intent ON public.ledger_entries(transaction_id, payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_currency ON public.ledger_entries(currency);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_posted_at ON public.ledger_entries(posted_at);

-- IMMUTABILITY GUARD TRIGGER: Block all UPDATE and DELETE operations
CREATE OR REPLACE FUNCTION public.enforce_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: ledger_entries is an immutable append-only record. UPDATE and DELETE operations are strictly forbidden.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_ledger_immutability ON public.ledger_entries;

CREATE TRIGGER trg_enforce_ledger_immutability
BEFORE UPDATE OR DELETE ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_ledger_immutability();
