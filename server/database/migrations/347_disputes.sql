-- 347_disputes.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Customer Disputes & Chargeback Management Repository

CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_reference VARCHAR(100) NOT NULL UNIQUE,
  transaction_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  amount NUMERIC(20,8) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL,
  reason VARCHAR(100) NOT NULL DEFAULT 'UNAUTHORIZED_CHARGE',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'EVIDENCE_SUBMITTED', 'WON', 'LOST', 'REVERSED')),
  reversal_journal_id UUID DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS dispute_reference VARCHAR(100);
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'OPEN';

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_disputes_ref'
  ) THEN
    ALTER TABLE public.disputes ADD CONSTRAINT uq_disputes_ref UNIQUE (dispute_reference);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_disputes_user_status ON public.disputes(user_id, status);
