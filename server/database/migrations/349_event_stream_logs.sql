-- 349_event_stream_logs.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Immutable Event Streaming Audit Log & OpenTelemetry Tracing Repository

CREATE TABLE IF NOT EXISTS public.event_stream_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(100) NOT NULL UNIQUE,
  stream_topic VARCHAR(100) NOT NULL DEFAULT 'banking.events',
  event_type VARCHAR(100) NOT NULL,
  trace_id VARCHAR(100) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.event_stream_logs ADD COLUMN IF NOT EXISTS event_id VARCHAR(100);
ALTER TABLE public.event_stream_logs ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_event_stream_id'
  ) THEN
    ALTER TABLE public.event_stream_logs ADD CONSTRAINT uq_event_stream_id UNIQUE (event_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_event_stream_topic_time ON public.event_stream_logs(stream_topic, published_at DESC);
