-- ============================================================
-- Migration 264: Nightly Reconciliation Runs
-- Migration 265: AI Treasury Insights
-- Phase 16 — Enterprise Financial Platform
-- ============================================================

-- ── 264: Nightly Reconciliation Runs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type              TEXT NOT NULL DEFAULT 'NIGHTLY', -- NIGHTLY | MANUAL | TRIGGERED
  status                TEXT NOT NULL DEFAULT 'RUNNING', -- RUNNING | COMPLETED | FAILED | PARTIAL
  run_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Stage tracking
  stage_ledger          TEXT DEFAULT 'PENDING', -- PENDING | RUNNING | COMPLETED | FAILED
  stage_provider_txns   TEXT DEFAULT 'PENDING',
  stage_provider_balance TEXT DEFAULT 'PENDING',
  stage_treasury        TEXT DEFAULT 'PENDING',
  stage_settlement      TEXT DEFAULT 'PENDING',
  -- Results
  total_checked         INT DEFAULT 0,
  total_matched         INT DEFAULT 0,
  total_discrepancies   INT DEFAULT 0,
  total_warnings        INT DEFAULT 0,
  discrepancy_amount    NUMERIC(20,8) DEFAULT 0,
  -- Timing
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  duration_ms           INT,
  -- Output
  report_summary        JSONB DEFAULT '{}',
  error_detail          TEXT,
  triggered_by          TEXT DEFAULT 'SYSTEM',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_runs_date   ON reconciliation_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_recon_runs_status ON reconciliation_runs(status);

-- Per-transaction reconciliation line items
CREATE TABLE IF NOT EXISTS reconciliation_line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID NOT NULL REFERENCES reconciliation_runs(id),
  correlation_id    TEXT,
  provider          TEXT NOT NULL,
  currency          TEXT NOT NULL,
  internal_amount   NUMERIC(20,8),
  provider_amount   NUMERIC(20,8),
  discrepancy       NUMERIC(20,8) GENERATED ALWAYS AS (
    COALESCE(provider_amount, 0) - COALESCE(internal_amount, 0)
  ) STORED,
  match_status      TEXT NOT NULL DEFAULT 'MATCHED',
  -- MATCHED | INTERNAL_ONLY | PROVIDER_ONLY | AMOUNT_MISMATCH | TIMING_GAP
  internal_ref      TEXT,
  provider_ref      TEXT,
  notes             TEXT,
  requires_action   BOOLEAN NOT NULL DEFAULT false,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rli_run_id  ON reconciliation_line_items(run_id);
CREATE INDEX IF NOT EXISTS idx_rli_status  ON reconciliation_line_items(match_status);

-- ── 265: AI Treasury Insights ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treasury_insights (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type       TEXT NOT NULL,
  -- LIQUIDITY_WARNING | HEALTH_DEGRADATION | LATENCY_SPIKE | ROUTING_RECOMMENDATION
  -- RESERVE_DEFICIT | CONCENTRATION_RISK | FAILOVER_ACTIVATED | RECONCILIATION_DISCREPANCY
  -- SETTLEMENT_DELAY | FORECAST_ALERT | SLA_BREACH | REBALANCING_NEEDED
  severity           TEXT NOT NULL DEFAULT 'INFO', -- INFO | WARNING | CRITICAL | EMERGENCY
  title              TEXT NOT NULL,
  body               TEXT NOT NULL,
  recommendation     TEXT,
  affected_provider  TEXT,
  affected_currency  TEXT,
  affected_amount    NUMERIC(20,8),
  confidence         NUMERIC(4,2) DEFAULT 1.0, -- 0.0–1.0 confidence level
  data_snapshot      JSONB DEFAULT '{}',        -- Supporting metrics
  status             TEXT NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | ACKNOWLEDGED | RESOLVED | SUPERSEDED
  acknowledged_by    UUID REFERENCES auth.users(id),
  acknowledged_at    TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  superseded_by      UUID,  -- FK to newer insight that replaces this one
  auto_expires_at    TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_severity ON treasury_insights(severity, status);
CREATE INDEX IF NOT EXISTS idx_insights_type     ON treasury_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_active   ON treasury_insights(status, generated_at DESC)
  WHERE status = 'ACTIVE';
