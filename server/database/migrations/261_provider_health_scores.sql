-- ============================================================
-- Migration 261: Provider Health Scores (Numerical, 0–100)
-- Phase 16 — Enterprise Financial Platform
-- ============================================================

-- Replaces binary HEALTHY/DOWN with continuous gradient scoring
CREATE TABLE IF NOT EXISTS provider_health_scores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider              TEXT NOT NULL UNIQUE,
  -- Component scores (0–100 each)
  latency_score         SMALLINT NOT NULL DEFAULT 100,  -- Based on P95 latency vs. baseline
  success_rate_score    SMALLINT NOT NULL DEFAULT 100,  -- 1-hour rolling success %
  webhook_delay_score   SMALLINT NOT NULL DEFAULT 100,  -- Webhook P95 delivery delay
  error_rate_score      SMALLINT NOT NULL DEFAULT 100,  -- API 4xx/5xx rate
  timeout_score         SMALLINT NOT NULL DEFAULT 100,  -- Timeout rate
  circuit_score         SMALLINT NOT NULL DEFAULT 100,  -- CLOSED=100, HALF_OPEN=50, OPEN=0
  rate_limit_score      SMALLINT NOT NULL DEFAULT 100,  -- Remaining rate limit headroom
  -- Composite (weighted average of above)
  composite_score       SMALLINT NOT NULL DEFAULT 100,
  -- Raw metrics for transparency
  p95_latency_ms        INT,
  success_rate_1h       NUMERIC(5,2),
  error_rate_1h         NUMERIC(5,2),
  timeout_rate_1h       NUMERIC(5,2),
  webhook_p95_ms        INT,
  rate_limit_remaining  INT,
  total_requests_1h     INT DEFAULT 0,
  -- Circuit state
  circuit_state         TEXT NOT NULL DEFAULT 'CLOSED', -- CLOSED | HALF_OPEN | OPEN
  -- Routing weight (dynamically computed for GatewayRouter)
  routing_weight        NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  -- Timestamps
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed all known providers
INSERT INTO provider_health_scores (provider) VALUES
  ('fincra'), ('anchor'), ('paystack'), ('grey'), ('nowpayments')
ON CONFLICT (provider) DO NOTHING;

-- History table for trending
CREATE TABLE IF NOT EXISTS provider_health_score_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,
  composite_score SMALLINT NOT NULL,
  latency_score   SMALLINT,
  success_rate_score SMALLINT,
  circuit_state   TEXT,
  p95_latency_ms  INT,
  success_rate_1h NUMERIC(5,2),
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phsh_provider_captured
  ON provider_health_score_history(provider, captured_at DESC);
