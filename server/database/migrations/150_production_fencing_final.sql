-- =========================================================================
-- MIGRATION 150: ABSOLUTE FENCING & REVERSAL PERSISTENCE (PROD-GRADE)
-- This migration upgrades the engine from time-based leases to Epoch-Authority.
-- =========================================================================

BEGIN;

-- 1. Hardened Shard Governance
ALTER TABLE system_shard_leases ADD COLUMN IF NOT EXISTS active_epoch_token UUID DEFAULT gen_random_uuid();
ALTER TABLE system_shard_leases ADD COLUMN IF NOT EXISTS monotonic_version BIGINT DEFAULT 1;

-- 2. Reversal Cooldown Queue (Persisted Compensation)
-- All financial side-effects MUST be DB-persisted to survive crashes.
CREATE TABLE IF NOT EXISTS reversal_cooldown_queue (
    id BIGSERIAL PRIMARY KEY,
    intent_id BIGINT NOT NULL REFERENCES causal_execution_queue(sequence_id),
    causal_group_id UUID NOT NULL,
    risk_class TEXT NOT NULL CHECK (risk_class IN ('SAFE', 'CONTROLLED', 'HARD')),
    cooldown_expiry_ts TIMESTAMPTZ NOT NULL,
    state TEXT DEFAULT 'pending' CHECK (state IN ('pending', 'executed', 'blocked', 'failed')),
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reversal_cooldown_expiry ON reversal_cooldown_queue(cooldown_expiry_ts, state) WHERE state = 'pending';

-- 3. Hardened Event Log Schema
ALTER TABLE financial_event_log ADD COLUMN IF NOT EXISTS epoch_token UUID;
ALTER TABLE financial_event_log ADD COLUMN IF NOT EXISTS intent_id BIGINT;
ALTER TABLE financial_event_log ADD COLUMN IF NOT EXISTS causal_group_id UUID;

-- 4. TRIGGER: Absolute Fenced Commit (Linearizable Gate)
-- This trigger rejects ANY insert that doesn't match the current authoritative epoch.
CREATE OR REPLACE FUNCTION verify_fenced_commit_final()
RETURNS TRIGGER AS $$
DECLARE
    v_active_token UUID;
BEGIN
    -- 1. Identify shard for this entity (wallet_id/payout_id)
    -- Logic: parse hex prefix of UUID % 4
    -- We assume the NEW.entity_id is a valid UUID representing the shard key (e.g. wallet_id)
    
    SELECT active_epoch_token INTO v_active_token
    FROM system_shard_leases
    WHERE shard_id = (('0x' || substring(NEW.entity_id::text, 1, 8))::bit(32)::int % 4);

    -- 2. ENFORCEMENT: Reject if the provided epoch token is stale.
    -- This provides atomicity: only the worker with the LATEST token from the CP can write.
    IF v_active_token IS NULL OR v_active_token != NEW.epoch_token THEN
        RAISE EXCEPTION 'FENCING_ERROR: Invalid or stale epoch token %. Shard authority has moved.', NEW.epoch_token;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fenced_commit ON financial_event_log;
CREATE TRIGGER trg_fenced_commit
BEFORE INSERT ON financial_event_log
FOR EACH ROW EXECUTE FUNCTION verify_fenced_commit_final();

COMMIT;
