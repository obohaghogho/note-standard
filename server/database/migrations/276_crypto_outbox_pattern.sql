-- Migration 276: Transactional Outbox Pattern for Crypto Ledger Engine
-- Guarantees atomic state + at-least-once event publication without ghost events on rollback.

CREATE TABLE IF NOT EXISTS public.crypto_outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crypto_outbox_status_created ON public.crypto_outbox_events(status, created_at);
