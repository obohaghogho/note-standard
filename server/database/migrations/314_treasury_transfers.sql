-- 314_treasury_transfers.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Auditable Internal Treasury Rebalancing Transfers

CREATE TABLE IF NOT EXISTS public.treasury_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_account_id UUID REFERENCES public.treasury_accounts(id) ON DELETE RESTRICT,
  target_account_id UUID REFERENCES public.treasury_accounts(id) ON DELETE RESTRICT,
  currency VARCHAR(10) NOT NULL,
  amount NUMERIC(20,8) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED')),
  journal_id UUID DEFAULT NULL,
  approved_by VARCHAR(100) DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.treasury_transfers ADD COLUMN IF NOT EXISTS journal_id UUID;
ALTER TABLE public.treasury_transfers ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100);

-- Indices
CREATE INDEX IF NOT EXISTS idx_treasury_transfers_status ON public.treasury_transfers(status);
CREATE INDEX IF NOT EXISTS idx_treasury_transfers_curr ON public.treasury_transfers(currency);
