-- 335_reconciliation_batches.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Settlement Batches & Provider Reconciliation Run Repository

CREATE TABLE IF NOT EXISTS public.reconciliation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_reference VARCHAR(100) NOT NULL UNIQUE,
  provider VARCHAR(50) NOT NULL,
  total_records INT NOT NULL DEFAULT 0,
  matched_records INT NOT NULL DEFAULT 0,
  unreconciled_breaks INT NOT NULL DEFAULT 0,
  total_amount NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PROCESSING', 'COMPLETED', 'HAS_BREAKS')),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations for pre-existing table instances
ALTER TABLE public.reconciliation_batches ADD COLUMN IF NOT EXISTS batch_reference VARCHAR(100);
ALTER TABLE public.reconciliation_batches ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE public.reconciliation_batches ADD COLUMN IF NOT EXISTS total_records INT DEFAULT 0;
ALTER TABLE public.reconciliation_batches ADD COLUMN IF NOT EXISTS matched_records INT DEFAULT 0;
ALTER TABLE public.reconciliation_batches ADD COLUMN IF NOT EXISTS unreconciled_breaks INT DEFAULT 0;
ALTER TABLE public.reconciliation_batches ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'COMPLETED';

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_rec_batches_ref'
  ) THEN
    ALTER TABLE public.reconciliation_batches ADD CONSTRAINT uq_rec_batches_ref UNIQUE (batch_reference);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_rec_batches_provider ON public.reconciliation_batches(provider, processed_at DESC);
