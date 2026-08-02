-- 310_dead_letter_queue.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Dead Letter Queue (DLQ) Failed Events & Categorized Failure Storage

CREATE TABLE IF NOT EXISTS public.dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  classification VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN' CHECK (classification IN ('TRANSIENT', 'VALIDATION', 'PROVIDER', 'INFRASTRUCTURE', 'UNKNOWN')),
  failed_reason TEXT NOT NULL,
  stack_trace TEXT DEFAULT NULL,
  worker_name VARCHAR(100) DEFAULT 'OutboxWorker',
  retry_count INT NOT NULL DEFAULT 0,
  trace_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REPLAYED', 'IGNORED', 'DELETED')),
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_retry_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.dead_letter_queue ADD COLUMN IF NOT EXISTS classification VARCHAR(30) DEFAULT 'UNKNOWN';
ALTER TABLE public.dead_letter_queue ADD COLUMN IF NOT EXISTS stack_trace TEXT;
ALTER TABLE public.dead_letter_queue ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);

-- Indices
CREATE INDEX IF NOT EXISTS idx_dlq_status_class ON public.dead_letter_queue(status, classification);
CREATE INDEX IF NOT EXISTS idx_dlq_event_id ON public.dead_letter_queue(event_id);
