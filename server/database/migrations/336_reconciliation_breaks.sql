-- 336_reconciliation_breaks.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Unreconciled Settlement Breaks & Difference Resolution Repository

CREATE TABLE IF NOT EXISTS public.reconciliation_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.reconciliation_batches(id) ON DELETE CASCADE,
  transaction_reference VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  expected_amount NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  actual_amount NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  variance NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  break_type VARCHAR(50) NOT NULL DEFAULT 'AMOUNT_MISMATCH',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED')),
  resolution_notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.reconciliation_breaks ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(100);
ALTER TABLE public.reconciliation_breaks ADD COLUMN IF NOT EXISTS variance NUMERIC(20,8) DEFAULT 0.00;
ALTER TABLE public.reconciliation_breaks ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'OPEN';

-- Indices
CREATE INDEX IF NOT EXISTS idx_rec_breaks_status ON public.reconciliation_breaks(status);
