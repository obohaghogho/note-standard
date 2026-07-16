-- =========================================================================
-- MIGRATION 135: ZERO-LOSS GLOBAL RECONCILIATION ENGINE
-- Implements multi-queue isolation and Triple-ID verification
-- =========================================================================

-- 1. Triple-ID Employment Identity Model
-- Ensures global uniqueness combining sender, amount, currency, and strict time windows
ALTER TABLE webhook_events 
    ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_webhook_events_fingerprint ON webhook_events(fingerprint_hash);

-- 2. Zero-Loss Reconciliation Pipeline (Queue Isolation)
-- Converting simple queue into partitioned states: 
-- pending_confirmation (needs basic human approval), ambiguous_match (multiple reference hints), failed_parse (total junk parse), delayed_arrival (arrived >24h)
ALTER TABLE reconciliation_queue 
    ADD COLUMN IF NOT EXISTS queue_type TEXT DEFAULT 'pending_confirmation';

CREATE INDEX IF NOT EXISTS idx_reconciliation_queue_type ON reconciliation_queue(queue_type);

-- Enforce strict queue routing natively in DB
DO $$
BEGIN
    ALTER TABLE reconciliation_queue DROP CONSTRAINT IF EXISTS reconciliation_queue_queue_type_check;
    ALTER TABLE reconciliation_queue ADD CONSTRAINT reconciliation_queue_queue_type_check CHECK (
        queue_type IN ('pending_confirmation', 'ambiguous_match', 'failed_parse', 'delayed_arrival')
    );
END $$;
