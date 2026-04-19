-- =========================================================================
-- MIGRATION 150: ABSOLUTE FENCING & SCHEDULER GOVERNANCE (FINAL)
-- Implements Authority-Gated writes and Leader-Elected Compensation.
-- =========================================================================

BEGIN;

-- 1. HARDENED SHARD GOVERNANCE
ALTER TABLE system_shard_leases ADD COLUMN IF NOT EXISTS active_epoch_token UUID DEFAULT gen_random_uuid();
ALTER TABLE system_shard_leases ADD COLUMN IF NOT EXISTS monotonic_version BIGINT DEFAULT 1;

-- 2. REVERSAL COOLDOWN QUEUE (Persisted Compensation)
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

-- 3. SCHEDULER LEADER ELECTION INFRASTRUCTURE
ALTER TABLE system_governance_policy ADD COLUMN IF NOT EXISTS scheduler_leader_token UUID;
ALTER TABLE system_governance_policy ADD COLUMN IF NOT EXISTS scheduler_lease_expiry TIMESTAMPTZ;

-- RPC: Atomic Shard Authority Acquisition (Absolute Fencing)
-- Generates/Accepts a fresh token that invalidates all previous ones.
CREATE OR REPLACE FUNCTION acquire_shard_lease_absolute(
    p_shard_id INT,
    p_worker_id UUID,
    p_epoch_token UUID
)
RETURNS TABLE (
    lease_id UUID,
    epoch_version BIGINT,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_epoch BIGINT;
    v_expires_at TIMESTAMPTZ := NOW() + interval '1 minute';
BEGIN
    UPDATE system_shard_leases
    SET owner_id = p_worker_id,
        epoch_version = epoch_version + 1,
        active_epoch_token = p_epoch_token,
        expires_at = v_expires_at,
        last_heartbeat = NOW()
    WHERE shard_id = p_shard_id
    RETURNING epoch_version INTO v_new_epoch;

    RETURN QUERY SELECT p_epoch_token, v_new_epoch, v_expires_at;
END;
$$;

-- RPC: Atomic Leader Election for Compensation Scheduler
-- Ensures single logical authority for time-based reversal scheduling.
CREATE OR REPLACE FUNCTION acquire_scheduler_lease(
    p_worker_id UUID,
    p_lease_duration_ms INT
)
RETURNS TABLE (
    leader_token UUID,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_token UUID := gen_random_uuid();
    v_expires_at TIMESTAMPTZ := NOW() + (p_lease_duration_ms || ' milliseconds')::interval;
BEGIN
    UPDATE system_governance_policy
    SET scheduler_leader_token = v_new_token,
        scheduler_lease_expiry = v_expires_at
    WHERE key = 'GLOBAL_POLICY'
      AND (scheduler_lease_expiry < NOW() OR scheduler_leader_token IS NULL);

    RETURN QUERY 
    SELECT scheduler_leader_token, scheduler_lease_expiry 
    FROM system_governance_policy 
    WHERE key = 'GLOBAL_POLICY';
END;
$$;

-- 4. HARDENED TRIGGER: Absolute Fenced Commit
-- Rejects any mutation from a worker holding a stale or invalid epoch token.
CREATE OR REPLACE FUNCTION verify_fenced_commit_final()
RETURNS TRIGGER AS $$
DECLARE
    v_active_token UUID;
BEGIN
    -- 1. Derive shard ID from entity index (hex prefix of UUID % 4)
    -- We assume NEW.entity_id is the partition key (wallet_id)
    SELECT active_epoch_token INTO v_active_token
    FROM system_shard_leases
    WHERE shard_id = (('0x' || substring(NEW.entity_id::text, 1, 8))::bit(32)::int % 4);

    -- 2. ENFORCEMENT: Reject stale worker epoch
    IF v_active_token IS NULL OR v_active_token != NEW.epoch_token THEN
        RAISE EXCEPTION 'FENCING_ERROR: Stale or invalid epoch token %. Authority has shifted.', NEW.epoch_token;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- RPC: Atomic Claim and Dispatch to Causal Queue
CREATE OR REPLACE FUNCTION dispatch_reversal_to_causal_queue(
    p_cooldown_id BIGINT,
    p_intent_id BIGINT,
    p_causal_group_id UUID,
    p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wallet_id UUID;
    v_shard_id INT;
    v_target_version INT;
BEGIN
    -- 1. Atomic Claim: Lock and status update with SKIP LOCKED protection in the caller
    UPDATE reversal_cooldown_queue
    SET state = 'executed'
    WHERE id = p_cooldown_id 
      AND state = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'REVERSAL_ALREADY_CLAIMED: ID %', p_cooldown_id;
    END IF;

    -- 2. Resolve shard destination for the reversal
    -- We extract wallet_id from the original intent
    SELECT wallet_id, shard_id, expected_version INTO v_wallet_id, v_shard_id, v_target_version
    FROM causal_execution_queue
    WHERE sequence_id = p_intent_id;

    -- 3. Dispatch: Push new compensation intent to the sharded worker
    INSERT INTO causal_execution_queue (
        idempotency_key,
        shard_id,
        wallet_id,
        intent_type,
        expected_version,
        payload
    ) VALUES (
        'reversal_' || p_cooldown_id,
        v_shard_id,
        v_wallet_id,
        'ledger_reversal',
        v_target_version + 1,
        p_payload
    );
END;
$$;

DROP TRIGGER IF EXISTS trg_fenced_commit ON financial_event_log;
CREATE TRIGGER trg_fenced_commit
BEFORE INSERT ON financial_event_log
FOR EACH ROW EXECUTE FUNCTION verify_fenced_commit_final();

COMMIT;
