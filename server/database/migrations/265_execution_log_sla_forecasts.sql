-- ============================================================
-- Migration 265: Payment Execution Log (CFO Idempotency & Correlation)
-- Migration 266: SLA Metrics
-- Migration 267: Treasury Forecasts
-- Phase 16 — Enterprise Financial Platform
-- ============================================================

-- ── 265: Payment Execution Log ───────────────────────────────────────────────
-- Central Financial Orchestrator idempotency + cross-provider correlation
CREATE SEQUENCE IF NOT EXISTS ns_txn_seq START 1;

CREATE TABLE IF NOT EXISTS payment_execution_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Correlation ID: NS-TXN-2026-000001
  correlation_id      TEXT UNIQUE NOT NULL
                      DEFAULT ('NS-TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                               LPAD(nextval('ns_txn_seq')::TEXT, 6, '0')),
  -- Idempotency
  idempotency_key     TEXT UNIQUE,
  -- Operation
  operation_type      TEXT NOT NULL,  -- DEPOSIT | WITHDRAWAL | PAYOUT | SWAP | REFUND
  user_id             UUID REFERENCES auth.users(id),
  currency            TEXT NOT NULL,
  amount              NUMERIC(20,8) NOT NULL,
  -- Execution state
  execution_state     TEXT NOT NULL DEFAULT 'INITIATED',
  -- INITIATED | COMPLIANCE_CHECK | FRAUD_CHECK | TREASURY_CHECK | FX_RESOLVED
  -- ROUTING | PROVIDER_EXECUTING | LEDGER_PENDING | COMPLETED | FAILED | COMPENSATING | COMPENSATED
  ledger_state        TEXT NOT NULL DEFAULT 'PENDING',
  -- PENDING | COMMITTED | ROLLED_BACK
  -- Provider tracking
  selected_provider   TEXT,
  provider_reference  TEXT,
  failover_count      INT NOT NULL DEFAULT 0,
  provider_history    JSONB DEFAULT '[]',  -- Array of {provider, reference, result, timestamp}
  -- CFO pipeline step results
  compliance_result   JSONB DEFAULT '{}',
  fraud_result        JSONB DEFAULT '{}',
  treasury_result     JSONB DEFAULT '{}',
  fx_result           JSONB DEFAULT '{}',
  routing_result      JSONB DEFAULT '{}',
  -- Timing
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  duration_ms         INT,
  -- Error
  error_code          TEXT,
  error_message       TEXT,
  retry_count         INT NOT NULL DEFAULT 0,
  last_retry_at       TIMESTAMPTZ,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pel_correlation   ON payment_execution_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_pel_idempotency   ON payment_execution_log(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_pel_user_state    ON payment_execution_log(user_id, execution_state);
CREATE INDEX IF NOT EXISTS idx_pel_state_created ON payment_execution_log(execution_state, created_at);

-- ── 266: Provider SLA Metrics ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_sla_metrics (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                TEXT NOT NULL,
  period_start            TIMESTAMPTZ NOT NULL,
  period_end              TIMESTAMPTZ NOT NULL,
  period_type             TEXT NOT NULL DEFAULT 'HOURLY', -- HOURLY | DAILY | WEEKLY | MONTHLY
  -- Uptime
  uptime_pct              NUMERIC(6,3),       -- e.g. 99.850
  downtime_minutes        NUMERIC(8,2),
  incidents_count         INT DEFAULT 0,
  -- Latency
  avg_latency_ms          INT,
  p50_latency_ms          INT,
  p95_latency_ms          INT,
  p99_latency_ms          INT,
  -- Requests
  total_requests          INT DEFAULT 0,
  successful_requests     INT DEFAULT 0,
  failed_requests         INT DEFAULT 0,
  timeout_requests        INT DEFAULT 0,
  success_rate_pct        NUMERIC(6,3) GENERATED ALWAYS AS (
    CASE WHEN total_requests > 0
    THEN (successful_requests::NUMERIC / total_requests * 100) ELSE 0 END
  ) STORED,
  -- Webhooks
  webhook_total           INT DEFAULT 0,
  webhook_delayed         INT DEFAULT 0,
  webhook_p95_delay_ms    INT,
  -- Recovery
  mttr_minutes            NUMERIC(8,2),  -- Mean time to recovery
  -- Error budget (99.9% SLA = 43.2 min/month = 0.1% error budget)
  error_budget_pct        NUMERIC(6,3),  -- Remaining error budget
  sla_target_pct          NUMERIC(6,3) DEFAULT 99.9,
  sla_breached            BOOLEAN NOT NULL DEFAULT false,
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, period_start, period_type)
);

CREATE INDEX IF NOT EXISTS idx_sla_provider_period ON provider_sla_metrics(provider, period_start DESC);

-- ── 267: Treasury Forecasts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treasury_forecasts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency              TEXT NOT NULL,
  forecast_horizon      TEXT NOT NULL DEFAULT '24H', -- 24H | 72H | 7D
  -- Current state
  current_balance       NUMERIC(20,8) NOT NULL,
  current_liability     NUMERIC(20,8) NOT NULL,
  current_reserve_ratio NUMERIC(8,4),
  -- Projections
  projected_deposits    NUMERIC(20,8) NOT NULL DEFAULT 0,
  projected_withdrawals NUMERIC(20,8) NOT NULL DEFAULT 0,
  projected_payouts     NUMERIC(20,8) NOT NULL DEFAULT 0,
  projected_net         NUMERIC(20,8) GENERATED ALWAYS AS (
    projected_deposits - projected_withdrawals - projected_payouts
  ) STORED,
  projected_balance     NUMERIC(20,8) GENERATED ALWAYS AS (
    current_balance + projected_deposits - projected_withdrawals - projected_payouts
  ) STORED,
  projected_reserve_ratio NUMERIC(8,4),
  -- Velocity inputs
  deposit_velocity_1h   NUMERIC(20,8),  -- Avg deposits/hour (last 7d)
  withdrawal_velocity_1h NUMERIC(20,8),
  payout_velocity_1h    NUMERIC(20,8),
  -- Risk flags
  is_deficit_forecast   BOOLEAN NOT NULL DEFAULT false,  -- Balance < liability projected
  reserve_below_warn    BOOLEAN NOT NULL DEFAULT false,
  reserve_below_critical BOOLEAN NOT NULL DEFAULT false,
  confidence            NUMERIC(4,2) DEFAULT 0.85,
  methodology           TEXT DEFAULT 'VELOCITY_EXTRAPOLATION',
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecasts_currency ON treasury_forecasts(currency, generated_at DESC);
