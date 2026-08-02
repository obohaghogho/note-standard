-- 303_transaction_state_history.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Audit Trail Logging for All Transaction State Machine Transitions

CREATE TABLE IF NOT EXISTS public.transaction_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  from_state VARCHAR(30) NOT NULL,
  to_state VARCHAR(30) NOT NULL,
  actor VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  correlation_id VARCHAR(100),
  trace_id VARCHAR(100),
  provider_reference VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for rapid transaction audit lookups & tracing
CREATE INDEX IF NOT EXISTS idx_tx_history_tx_id ON public.transaction_state_history(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_history_trace ON public.transaction_state_history(trace_id);
CREATE INDEX IF NOT EXISTS idx_tx_history_correlation ON public.transaction_state_history(correlation_id);
CREATE INDEX IF NOT EXISTS idx_tx_history_occurred ON public.transaction_state_history(occurred_at);
