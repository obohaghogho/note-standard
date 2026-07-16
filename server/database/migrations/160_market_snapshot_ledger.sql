-- =========================================================================
-- MIGRATION 160: MARKET SNAPSHOT LEDGER & VALUATION AUDIT TRAIL (v6.0)
-- Implements Atomic Pricing Snapshots and Semantic Drift Auditing.
-- =========================================================================

BEGIN;

-- 1. MARKET SNAPSHOT LEDGER (Atomic Pricing source of truth)
CREATE TABLE IF NOT EXISTS market_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Atomic rate set: { "BTC": 65000.12, "ETH": 3500.45, ... }
    rates JSONB NOT NULL,
    
    -- Hybrid Confidence Score [0, 1]
    -- 65% Consensus / 35% Velocity
    confidence_score NUMERIC(5, 4) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    
    -- Source metadata for reconciliation analytics
    source_metadata JSONB DEFAULT '{}',
    
    -- Expiry handle (Snapshots older than 24h are archived/purged)
    is_archived BOOLEAN DEFAULT FALSE,
    
    -- Immutable Integrity Checksum (hash of rates)
    checksum TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_created ON market_snapshots(created_at DESC) WHERE is_archived = FALSE;

-- 2. VALUATION AUDIT TRAIL (Authoritative forensic ledger)
CREATE TABLE IF NOT EXISTS valuation_audit_trail (
    id BIGSERIAL PRIMARY KEY,
    wallet_id UUID NOT NULL,
    snapshot_id UUID REFERENCES market_snapshots(id),
    
    -- Deterministic Replay Key: hash(walletId + snapshotId + timestampBucket + riskPolicyVersion)
    evaluation_replay_key TEXT NOT NULL,
    
    -- Financial state capture
    previous_valuation_usd NUMERIC(24, 8),
    new_valuation_usd NUMERIC(24, 8),
    delta_percentage NUMERIC(10, 6), -- (applied / prev)
    
    -- Drift Classification
    -- LOW (<0.05%), MEDIUM (0.05-0.5%), HIGH (>0.5%)
    drift_class TEXT NOT NULL CHECK (drift_class IN ('LOW', 'MEDIUM', 'HIGH')),
    
    -- State transitions
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('PRICE_UPDATE', 'CACHE_REFRESH', 'SANITIZATION', 'MISMATCH_DETECTED')),
    prev_status TEXT,
    new_status TEXT,
    
    -- Risk Metadata
    risk_metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valuation_audit_wallet ON valuation_audit_trail(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_valuation_audit_replay ON valuation_audit_trail(evaluation_replay_key);
CREATE INDEX IF NOT EXISTS idx_valuation_drift_high ON valuation_audit_trail(created_at DESC) WHERE drift_class = 'HIGH';

-- 3. GOVERNANCE: CALIBRATION FREEZE WINDOW
-- Ensures system cannot auto-tune during the stabilization period.
ALTER TABLE system_governance_policy ADD COLUMN IF NOT EXISTS calibration_freeze_until TIMESTAMPTZ;

-- Initialize the global policy freeze window (48 hours from deployment)
UPDATE system_governance_policy 
SET calibration_freeze_until = NOW() + INTERVAL '48 hours'
WHERE key = 'GLOBAL_POLICY';

-- 4. RPC: Atomic Evaluation Capture
-- Ensures that Snapshot + Audit log are created atomically for authoritative actions.
CREATE OR REPLACE FUNCTION capture_valuation_event(
    p_wallet_id UUID,
    p_snapshot_id UUID,
    p_replay_key TEXT,
    p_prev_val NUMERIC,
    p_new_val NUMERIC,
    p_trigger TEXT,
    p_prev_status TEXT,
    p_new_status TEXT,
    p_risk_meta JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_audit_id BIGINT;
    v_delta NUMERIC;
BEGIN
    -- Calculate delta percentage safely
    IF p_prev_val > 0 THEN
        v_delta := ABS(p_new_val - p_prev_val) / p_prev_val;
    ELSE
        v_delta := 1; -- 100% change from 0
    END IF;

    INSERT INTO valuation_audit_trail (
        wallet_id,
        snapshot_id,
        evaluation_replay_key,
        previous_valuation_usd,
        new_valuation_usd,
        delta_percentage,
        drift_class,
        trigger_type,
        prev_status,
        new_status,
        risk_metadata
    ) VALUES (
        p_wallet_id,
        p_snapshot_id,
        p_replay_key,
        p_prev_val,
        p_new_val,
        v_delta,
        CASE 
            WHEN v_delta < 0.0005 THEN 'LOW'
            WHEN v_delta < 0.005 THEN 'MEDIUM'
            ELSE 'HIGH'
        END,
        p_trigger,
        p_prev_status,
        p_new_status,
        p_risk_meta
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$;

COMMIT;
