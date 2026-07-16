-- Migration 162: Adversarial Chaos Ledger (DFOS v6.0)
-- Purpose: Provide persistent storage for deterministic stress simulation results and behavioral forensics.

-- 1. Simulation Scenario Templates
CREATE TABLE IF NOT EXISTS simulation_scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    failure_template JSONB NOT NULL, -- { axes: ['price', 'latency', 'desync'], intensity: 'HIGH' }
    base_seed TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_run_at TIMESTAMPTZ
);

-- 2. Adversarial Simulation Ledger (Parallel Universe Truth)
CREATE TABLE IF NOT EXISTS simulation_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES simulation_scenarios(id),
    run_seed TEXT NOT NULL,
    
    -- Inputs (The Chaos Injected)
    injected_failures JSONB NOT NULL, -- { drift_bps: N, latency_ms: M, desync_tier: 'MACRO' }
    
    -- Outputs (Shadow Decision)
    shadow_decision JSONB NOT NULL, -- { state: 'STABLE', confidence: 0.85, frozenAssets: [] }
    
    -- Behavioral Metrics (Relational)
    relational_metrics JSONB NOT NULL, -- { healing_to_drift: R, entropy_gradient: G, recovery_time: T }
    
    -- Classification Outcome
    outcome_classification TEXT NOT NULL, -- STABLE_CORRECT, STABLE_INCORRECT, UNSTABLE_VISIBLE, RECOVERED_WITH_DRIFT
    
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sim_ledger_scenario ON simulation_ledger(scenario_id);
CREATE INDEX IF NOT EXISTS idx_sim_ledger_outcome ON simulation_ledger(outcome_classification);

-- 3. Deterministic Seed Initialization
INSERT INTO simulation_scenarios (name, description, failure_template, base_seed)
VALUES 
('FLASH_CRASH_REPLAY', 'Simulates 5% price discovery in < 60s window across multiple providers.', '{"axes": ["price", "velocity"], "intensity": "EXTREME"}', 'dfos6_seed_alpha'),
('SINGLE_SOURCE_ZOMBIE', 'One provider drifts 2% while reporting high confidence (Stale data simulation).', '{"axes": ["desync", "price"], "intensity": "MEDIUM"}', 'dfos6_seed_beta'),
('QUORUM_LATENCY_STORM', 'All providers experience meso-tier latency desync (500ms-3s).', '{"axes": ["latency"], "intensity": "HIGH"}', 'dfos6_seed_gamma')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE simulation_scenarios IS 'Deterministic templates for DFOS v6.0 chaos testing.';
COMMENT ON TABLE simulation_ledger IS 'Immutable audit trail of shadow arbitration outcomes under adversarial conditions.';
