-- =========================================================================
-- MIGRATION 146: DETERMINISTIC FINANCIAL OPERATING SYSTEM (CORE)
-- Implements Event Sourcing, Causal Ordering, and Commit Arbitration
-- =========================================================================

BEGIN;

-- 1. Deterministic System Modes
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_kernel_mode') THEN
        CREATE TYPE system_kernel_mode AS ENUM ('NORMAL', 'DEGRADED', 'ISOLATION', 'SAFE');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS kernel_modes (
    id SERIAL PRIMARY KEY,
    current_mode system_kernel_mode DEFAULT 'NORMAL',
    last_transition_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

INSERT INTO kernel_modes (current_mode) VALUES ('NORMAL') ON CONFLICT DO NOTHING;

-- 2. State Versioning (Monotonic)
-- Add versioning to primary financial entities
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS state_version INT DEFAULT 1;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS state_version INT DEFAULT 1;

-- 3. Hardened Event Log (Absolute Source of Truth)
CREATE TABLE IF NOT EXISTS financial_event_log (
    sequence_id BIGSERIAL PRIMARY KEY,
    causation_id UUID, -- Reference to the triggering event
    event_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    entity_scope TEXT NOT NULL, -- e.g. 'payout_request', 'ledger_entry', 'wallet'
    expected_version INT NOT NULL, -- The version the admin/service THOUGHT it was at
    payload JSONB NOT NULL,
    event_hash TEXT,
    previous_event_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_log_entity ON financial_event_log(entity_id, sequence_id);
CREATE INDEX IF NOT EXISTS idx_event_log_hash ON financial_event_log(event_hash);

-- 4. Acceleration Snapshots (Cache Only)
CREATE TABLE IF NOT EXISTS event_snapshots (
    id SERIAL PRIMARY KEY,
    entity_id UUID NOT NULL,
    last_sequence_id BIGINT NOT NULL,
    state_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TRIGGER: Commit Arbitration & Version Enforcement
-- This is the kernel boundary where race conditions are neutralized.
CREATE OR REPLACE FUNCTION enforce_commit_arbitration()
RETURNS TRIGGER AS $$
DECLARE
    v_current_version INT;
    v_prev_hash TEXT;
BEGIN
    -- 1. Get current version of the target entity
    IF NEW.entity_scope = 'payout_request' THEN
        SELECT state_version INTO v_current_version FROM payout_requests WHERE id = NEW.entity_id FOR UPDATE;
    ELSIF NEW.entity_scope = 'ledger_entry' THEN
        SELECT state_version INTO v_current_version FROM ledger_entries WHERE id = NEW.entity_id FOR UPDATE;
    ELSIF NEW.entity_scope = 'wallet' THEN
        SELECT 1 INTO v_current_version; -- Wallets versioning managed via ledger history
    END IF;

    -- 2. ATOMIC ARBITRATION RULE: Expected version must match Current version
    IF v_current_version IS NOT NULL AND v_current_version != NEW.expected_version THEN
        RAISE EXCEPTION 'Commit Arbitration Failure: Stale state version for entity %. Expected %, found %.', NEW.entity_id, NEW.expected_version, v_current_version;
    END IF;

    -- 3. Causal Chain Hashing
    SELECT event_hash INTO v_prev_hash FROM financial_event_log ORDER BY sequence_id DESC LIMIT 1;
    NEW.previous_event_hash := COALESCE(v_prev_hash, 'GENESIS');
    NEW.event_hash := encode(digest(
        concat(COALESCE(v_prev_hash, 'GENESIS'), NEW.sequence_id::text, NEW.entity_id::text, NEW.payload::text), 
        'sha256'
    ), 'hex');

    -- 4. Increment the target entity's version (Side effect of successful commit)
    IF NEW.entity_scope = 'payout_request' THEN
        UPDATE payout_requests SET state_version = state_version + 1 WHERE id = NEW.entity_id;
    ELSIF NEW.entity_scope = 'ledger_entry' THEN
        UPDATE ledger_entries SET state_version = state_version + 1 WHERE id = NEW.entity_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commit_arbitration ON financial_event_log;
CREATE TRIGGER trg_commit_arbitration
BEFORE INSERT ON financial_event_log
FOR EACH ROW EXECUTE FUNCTION enforce_commit_arbitration();

COMMIT;
