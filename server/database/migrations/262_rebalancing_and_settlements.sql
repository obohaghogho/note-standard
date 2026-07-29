-- ============================================================
-- Migration 262: Rebalancing Recommendations
-- Migration 263: Settlement Positions
-- Phase 16 — Enterprise Financial Platform
-- ============================================================

-- ── 262: Rebalancing Recommendations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rebalancing_recommendations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_provider        TEXT NOT NULL,
  to_provider          TEXT NOT NULL,
  currency             TEXT NOT NULL,
  recommended_amount   NUMERIC(20,8) NOT NULL,
  from_balance         NUMERIC(20,8),
  to_balance           NUMERIC(20,8),
  total_liquidity      NUMERIC(20,8),
  from_pct_before      NUMERIC(6,2), -- % of total before rebalance
  to_pct_before        NUMERIC(6,2),
  target_pct           NUMERIC(6,2), -- Target distribution % for this provider
  reason               TEXT NOT NULL,
  urgency              TEXT NOT NULL DEFAULT 'LOW', -- LOW | MEDIUM | HIGH | CRITICAL
  status               TEXT NOT NULL DEFAULT 'OPEN',
  -- OPEN | ACKNOWLEDGED | IN_PROGRESS | ACTIONED | RESOLVED | DISMISSED
  acknowledged_by      UUID REFERENCES auth.users(id),
  acknowledged_at      TIMESTAMPTZ,
  actioned_by          UUID REFERENCES auth.users(id),
  actioned_at          TIMESTAMPTZ,
  resolution_notes     TEXT,
  expires_at           TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rebal_status   ON rebalancing_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_rebal_currency ON rebalancing_recommendations(currency, status);

-- ── 263: Settlement Positions ─────────────────────────────────────────────────
-- Every payment's settlement lifecycle per provider
CREATE TABLE IF NOT EXISTS settlement_positions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id       TEXT,                  -- NS-TXN-YYYY-NNNNNN
  transaction_id       TEXT,                  -- Internal transaction ID
  provider             TEXT NOT NULL,
  provider_reference   TEXT,                  -- Provider's own reference
  currency             TEXT NOT NULL,
  gross_amount         NUMERIC(20,8) NOT NULL,
  fee_amount           NUMERIC(20,8) NOT NULL DEFAULT 0,
  net_amount           NUMERIC(20,8) GENERATED ALWAYS AS (gross_amount - fee_amount) STORED,
  settlement_stage     TEXT NOT NULL DEFAULT 'COLLECTED',
  -- COLLECTED → PENDING_SETTLEMENT → SETTLED → FAILED → REVERSED → CHARGEBACK → REFUNDED
  expected_settlement  TIMESTAMPTZ,           -- T+N date from SettlementCalendar
  actual_settlement    TIMESTAMPTZ,
  settlement_reference TEXT,                  -- Provider's settlement batch ID
  failure_reason       TEXT,
  reversal_reason      TEXT,
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_provider_stage   ON settlement_positions(provider, settlement_stage);
CREATE INDEX IF NOT EXISTS idx_sp_correlation      ON settlement_positions(correlation_id);
CREATE INDEX IF NOT EXISTS idx_sp_expected         ON settlement_positions(expected_settlement);

-- Settlement stage transitions (immutable audit trail)
CREATE TABLE IF NOT EXISTS settlement_position_transitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id     UUID NOT NULL REFERENCES settlement_positions(id),
  from_stage      TEXT,
  to_stage        TEXT NOT NULL,
  transitioned_by TEXT,
  reason          TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spt_position ON settlement_position_transitions(position_id, created_at);

-- Block retroactive updates to transitions
CREATE OR REPLACE FUNCTION block_settlement_transition_updates()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Settlement position transitions are immutable — no UPDATE or DELETE permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_settlement_transitions
  BEFORE UPDATE OR DELETE ON settlement_position_transitions
  FOR EACH ROW EXECUTE FUNCTION block_settlement_transition_updates();
