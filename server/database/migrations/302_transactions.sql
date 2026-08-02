-- 302_transactions.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Execution Attempt Record with Optimistic Locking (version INT DEFAULT 1)

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.payment_sessions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  provider_reference VARCHAR(100),
  provider VARCHAR(50) NOT NULL DEFAULT 'fincra',
  currency VARCHAR(10) NOT NULL,
  amount NUMERIC(20,8) NOT NULL CHECK (amount > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'CREATED' CHECK (status IN (
    'CREATED', 'AUTHORIZED', 'PENDING', 'PROCESSING', 'SUCCEEDED', 
    'POSTED', 'SETTLED', 'RECONCILED', 'ARCHIVED', 
    'FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED', 'POSTING_FAILED', 'REFUNDED'
  )),
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  reconciliation_run_id VARCHAR(100) DEFAULT NULL,
  provider_statement_id VARCHAR(100) DEFAULT NULL,
  matched_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations for existing table instances
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS intent_id UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(100);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'fincra';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reconciliation_run_id VARCHAR(100);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider_statement_id VARCHAR(100);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;

-- Indices
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_intent ON public.transactions(intent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_provider_ref ON public.transactions(provider_reference);
