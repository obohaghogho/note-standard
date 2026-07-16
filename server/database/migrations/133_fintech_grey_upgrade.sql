-- =========================================================================
-- FINTECH GREY UPGRADE MIGRATION (133)
-- Implements idempotency, reconciliation, and strict constraints
-- =========================================================================

-- 1. Webhook Events Table (Strict Idempotency)
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    external_id TEXT UNIQUE, -- Provider's message ID or tracking ID
    payload_hash TEXT UNIQUE NOT NULL, -- SHA-256 hash of the payload to catch duplicates
    status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'success', 'failed', 'skipped'
    error_message TEXT,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_external_id ON webhook_events(external_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_payload_hash ON webhook_events(payload_hash);

-- 2. Reconciliation Queue (For Unmatched/Failed Payments)
CREATE TABLE IF NOT EXISTS reconciliation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_reference TEXT,
    raw_payload JSONB,
    parsed_data JSONB,
    reason TEXT NOT NULL, -- 'amount_mismatch', 'expired', 'parsing_failed', 'reference_not_found', etc.
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'rejected', 'auto_recovered'
    resolved_by UUID REFERENCES profiles(id),
    resolution_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_queue_status ON reconciliation_queue(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_queue_ref ON reconciliation_queue(payment_reference);

-- 3. Audit Logs (For explicit tracking of credibility attempts)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT NOT NULL,
    action TEXT NOT NULL, -- 'webhook_received', 'parsing_attempt', 'matching_attempt', 'rpc_crediting', 'queued_reconciliation'
    status TEXT NOT NULL, -- 'success', 'failed', 'pending'
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_reference ON audit_logs(reference);

-- 4. Enforce Unique User References on Payments Table
-- Payments table contains metadata JSONB. The user_reference is critical for mapping.
-- This ensures no two transactions can share the same user_reference, preventing replay injection.
-- Uses DO block since indexes cannot be created IF NOT EXISTS in some PG older versions easily without errors handling,
-- but IF NOT EXISTS is supported natively on index creation in PG 9.5+.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_user_reference 
ON payments ((metadata->>'user_reference'))
WHERE metadata->>'user_reference' IS NOT NULL AND status != 'failed';

-- 5. Add configuration settings for Grey (if not using env variables directly)
-- Note: Tolerances can be hardcoded in backend app logic.
