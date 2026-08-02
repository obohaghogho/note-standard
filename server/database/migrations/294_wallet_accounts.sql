-- 294_wallet_accounts.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Per-currency wallet account model storing cached balance projections

CREATE TABLE IF NOT EXISTS public.wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  currency VARCHAR(10) NOT NULL,
  account_type VARCHAR(20) NOT NULL DEFAULT 'PRIMARY' CHECK (account_type IN ('PRIMARY', 'ESCROW', 'BONUS', 'FEES', 'REWARDS')),
  available_balance NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
  pending_balance NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  locked_balance NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wallet_accounts_user_curr_type UNIQUE(user_id, currency, account_type)
);

-- Indices for fast user & currency balance queries
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user ON public.wallet_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_currency ON public.wallet_accounts(currency);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_status ON public.wallet_accounts(status);
