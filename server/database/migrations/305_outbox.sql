-- 305_outbox.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Transactional Outbox Pattern with Dead Letter Queue (DLQ) support

CREATE TABLE IF NOT EXISTS public.outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL DEFAULT 'Transaction',
  aggregate_id VARCHAR(100) NOT NULL,
  trace_id VARCHAR(100),
  version INT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DLQ')),
  retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ DEFAULT NULL
);

-- Safe Schema Alterations for existing table instances
ALTER TABLE public.outbox ADD COLUMN IF NOT EXISTS aggregate_type VARCHAR(50) DEFAULT 'Transaction';
ALTER TABLE public.outbox ADD COLUMN IF NOT EXISTS aggregate_id VARCHAR(100);
ALTER TABLE public.outbox ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);
ALTER TABLE public.outbox ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE public.outbox ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Indices for rapid queue polling by background outbox workers
CREATE INDEX IF NOT EXISTS idx_outbox_status_retry ON public.outbox(status, retry_count, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON public.outbox(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_trace ON public.outbox(trace_id);
