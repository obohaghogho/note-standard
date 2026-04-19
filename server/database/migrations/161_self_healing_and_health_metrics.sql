-- Migration 161: Self-Healing & Health Metrics (DFOS v6.0)
-- Purpose: Track provider reliability and audit autonomous consensus repairs.

-- 1. Provider Health Ledger
CREATE TABLE IF NOT EXISTS market_provider_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_name TEXT NOT NULL,
    latency_ms INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 100.00,
    drift_bps INTEGER DEFAULT 0, -- Average drift in basis points
    outlier_count INTEGER DEFAULT 0,
    is_quarantined BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_provider_health_name ON market_provider_health(provider_name);

-- 2. Self-Healing Audit Trail
CREATE TABLE IF NOT EXISTS market_healing_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL, -- 'WEIGHT_ADJUST', 'QUARANTINE', 'CACHE_HEAL', 'EMERGENCY_REFRESH'
    provider_name TEXT,
    severity TEXT DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH'
    prev_state JSONB,
    new_state JSONB,
    reason TEXT,
    snapshot_id UUID REFERENCES market_snapshots(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_healing_events_snapshot ON market_healing_events(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_healing_events_type ON market_healing_events(event_type);

-- 3. Gated Healing RPC
CREATE OR REPLACE FUNCTION capture_healing_event(
    p_event_type TEXT,
    p_provider_name TEXT,
    p_severity TEXT,
    p_prev_state JSONB,
    p_new_state JSONB,
    p_reason TEXT,
    p_snapshot_id UUID
) RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    -- Atomic Healing Audit
    INSERT INTO market_healing_events (
        event_type, provider_name, severity, prev_state, new_state, reason, snapshot_id
    ) VALUES (
        p_event_type, p_provider_name, p_severity, p_prev_state, p_new_state, p_reason, p_snapshot_id
    ) RETURNING id INTO v_event_id;

    -- If HIGH severity healing (e.g. Cache Repair), update provider health
    IF p_severity = 'HIGH' AND p_provider_name IS NOT NULL THEN
        UPDATE market_provider_health 
        SET outlier_count = outlier_count + 1,
            last_updated = NOW()
        WHERE provider_name = p_provider_name;
    END IF;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Initial Seed for Providers
INSERT INTO market_provider_health (provider_name) 
VALUES ('coingecko'), ('nowpayments'), ('exchangerate_api')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE market_provider_health IS 'DFOS v6.0 Source Reliability Ledger';
COMMENT ON TABLE market_healing_events IS 'DFOS v6.0 Autonomous Stabilization Audit Trail';
