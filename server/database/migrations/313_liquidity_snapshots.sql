-- 313_liquidity_snapshots.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Treasury Liquidity Snapshots & 24-Hour Requirement Projections

CREATE TABLE IF NOT EXISTS public.liquidity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treasury_account_id UUID REFERENCES public.treasury_accounts(id) ON DELETE SET NULL,
  currency VARCHAR(10) NOT NULL,
  available_balance NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  reserved_balance NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  settlement_balance NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  pending_balance NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  projected_24h_req NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations for pre-existing table instances
ALTER TABLE public.liquidity_snapshots ADD COLUMN IF NOT EXISTS treasury_account_id UUID;
ALTER TABLE public.liquidity_snapshots ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE public.liquidity_snapshots ADD COLUMN IF NOT EXISTS available_balance NUMERIC(20,8) DEFAULT 0.00;
ALTER TABLE public.liquidity_snapshots ADD COLUMN IF NOT EXISTS reserved_balance NUMERIC(20,8) DEFAULT 0.00;
ALTER TABLE public.liquidity_snapshots ADD COLUMN IF NOT EXISTS settlement_balance NUMERIC(20,8) DEFAULT 0.00;
ALTER TABLE public.liquidity_snapshots ADD COLUMN IF NOT EXISTS pending_balance NUMERIC(20,8) DEFAULT 0.00;
ALTER TABLE public.liquidity_snapshots ADD COLUMN IF NOT EXISTS projected_24h_req NUMERIC(20,8) DEFAULT 0.00;
ALTER TABLE public.liquidity_snapshots ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ DEFAULT NOW();

-- Indices
CREATE INDEX IF NOT EXISTS idx_liquidity_curr_snap ON public.liquidity_snapshots(currency, snapshot_at DESC);
