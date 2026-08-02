-- 304_webhook_events.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Webhook Events, Deduplication Locks, Quarantining Pipeline

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(100),
  provider VARCHAR(50) NOT NULL DEFAULT 'fincra',
  provider_reference VARCHAR(100),
  provider_sequence INT DEFAULT 1,
  event_type VARCHAR(100) NOT NULL,
  payload_hash VARCHAR(128) NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  parsed_payload JSONB DEFAULT '{}'::jsonb,
  headers JSONB DEFAULT '{}'::jsonb,
  signature TEXT,
  received_ip VARCHAR(50),
  trace_id VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN (
    'RECEIVED', 'VALIDATING', 'VALIDATED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DUPLICATE', 'QUARANTINED'
  )),
  quarantine_reason VARCHAR(50) DEFAULT NULL CHECK (quarantine_reason IS NULL OR quarantine_reason IN (
    'INVALID_SIGNATURE', 'INVALID_SCHEMA', 'UNSUPPORTED_EVENT', 'OUT_OF_ORDER_EVENT', 'UNKNOWN_PROVIDER', 'STALE_EVENT'
  )),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT uq_webhook_events_hash UNIQUE(payload_hash)
);

-- Safe Schema Alterations for existing table instances
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS event_id VARCHAR(100);
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'fincra';
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(100);
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS provider_sequence INT DEFAULT 1;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS parsed_payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS headers JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS received_ip VARCHAR(50);
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS quarantine_reason VARCHAR(50);

-- Indices
CREATE INDEX IF NOT EXISTS idx_webhook_events_hash ON public.webhook_events(payload_hash);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_ref ON public.webhook_events(provider_reference);
