-- 309_outbox_worker.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Outbox Consumer Progress & Idempotency Tracking

CREATE TABLE IF NOT EXISTS public.outbox_consumer_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(100) NOT NULL,
  consumer_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  error_message TEXT DEFAULT NULL,
  processed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_outbox_consumer_event UNIQUE(event_id, consumer_name)
);

-- Safe Schema Alterations
ALTER TABLE public.outbox_consumer_progress ADD COLUMN IF NOT EXISTS attempts INT DEFAULT 0;
ALTER TABLE public.outbox_consumer_progress ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Indices
CREATE INDEX IF NOT EXISTS idx_outbox_consumer_status ON public.outbox_consumer_progress(consumer_name, status);
