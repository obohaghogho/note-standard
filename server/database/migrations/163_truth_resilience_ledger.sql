-- Migration 163: Truth Resilience & Epistemological Ledger (DFOS v6.x+)
-- Purpose: Establish infrastructure for Truth Independence, Tiered Metadata, and Temporal Integrity.

-- 1. Tiered Provider Correlation & Diversity Store
CREATE TABLE IF NOT EXISTS market_provider_correlation (
    provider_id TEXT PRIMARY KEY,
    
    -- Layer 1: Static Identity (Seeded)
    static_metadata JSONB NOT NULL DEFAULT '{
        "infra": "unknown",
        "cdn": "unknown", 
        "region": "unknown",
        "type": "unknown",
        "transport": "unknown"
    }'::jsonb,
    
    -- Layer 2: Derived Structural Risk (Calculated)
    structural_risk JSONB NOT NULL DEFAULT '{
        "shared_infra_score": 0,
        "shared_cdn_score": 0,
        "aggregation_depth": 0
    }'::jsonb,
    
    -- Layer 3: Dynamic Behavioral Correlation
    behavioral_pcs FLOAT DEFAULT 1.0, -- 1.0 = Purely Independent, 0.0 = Purely Coupled
    behavioral_metadata JSONB DEFAULT '{}'::jsonb, -- { avg_latency, tick_rate, lead_lag_score }
    
    -- Layer 4: Behavioral Fingerprint
    fingerprint TEXT, -- hash(latency_pattern + update_frequency)
    
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Temporal Integrity & Load Ledger
CREATE TABLE IF NOT EXISTS temporal_integrity_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_epoch_bucket BIGINT NOT NULL, -- Bucket 5s increments
    
    -- Hybrid Clock Signals
    event_loop_p99_ms FLOAT NOT NULL,
    monotonic_drift_ms FLOAT NOT NULL,
    wall_clock_drift_ms FLOAT NOT NULL,
    scheduling_skew_ms FLOAT NOT NULL,
    
    -- Load Attribution
    internal_load_metrics JSONB NOT NULL, -- { cpu_user, cpu_system, mem_rss, event_loop_lag }
    
    time_integrity_score FLOAT NOT NULL, -- 0.0 to 1.0
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temporal_ledger_epoch ON temporal_integrity_ledger(snapshot_epoch_bucket);

-- 3. Market Heartbeat & Microstructure
CREATE TABLE IF NOT EXISTS market_heartbeat_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_pair TEXT NOT NULL,
    snapshot_epoch_bucket BIGINT NOT NULL,
    
    -- Microstructure Signals
    tick_frequency FLOAT NOT NULL, -- Updates per minute
    spread_width_bps FLOAT,
    volatility_observed_bps FLOAT, -- Derived from tick-rate clustering
    
    entropy_gradient FLOAT NOT NULL,
    is_suspicious BOOLEAN DEFAULT FALSE, -- Flagged by ACE (Anti-Consensus Engine)
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_ledger_asset_epoch ON market_heartbeat_ledger(asset_pair, snapshot_epoch_bucket);

-- 4. Initial Structural Diversity Seed
INSERT INTO market_provider_correlation (provider_id, static_metadata, structural_risk)
VALUES 
('coingecko', '{"infra": "aws", "cdn": "cloudflare", "region": "us-east-1", "type": "aggregator", "transport": "rest"}', '{"shared_infra_score": 0.15, "shared_cdn_score": 0.25, "aggregation_depth": 3}'),
('nowpayments', '{"infra": "aws", "cdn": "cloudflare", "region": "eu-central-1", "type": "aggregator", "transport": "rest"}', '{"shared_infra_score": 0.15, "shared_cdn_score": 0.25, "aggregation_depth": 2}'),
('exchangerate_api', '{"infra": "gcp", "cdn": "fastly", "region": "us-west-1", "type": "fiat_bridge", "transport": "rest"}', '{"shared_infra_score": 0.10, "shared_cdn_score": 0.10, "aggregation_depth": 1}')
ON CONFLICT (provider_id) DO UPDATE SET 
    static_metadata = EXCLUDED.static_metadata,
    structural_risk = EXCLUDED.structural_risk;

COMMENT ON TABLE market_provider_correlation IS 'Truth Resilience: Multi-layered metadata store for tracking structural and behavioral dependencies.';
COMMENT ON TABLE temporal_integrity_ledger IS 'Truth Resilience: Composite temporal signals and internal load attribution audit.';
COMMENT ON TABLE market_heartbeat_ledger IS 'Truth Resilience: Orthogonal micro-structure signals to detect the Perfectly-Wrong-Market scenario.';
