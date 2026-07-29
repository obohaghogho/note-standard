-- ============================================================
-- Migration 259: Routing Policies & Decision Log
-- Phase 16 — Enterprise Financial Platform
-- ============================================================

-- Provider routing rules per transaction type + currency
CREATE TABLE IF NOT EXISTS routing_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency            TEXT NOT NULL,
  method              TEXT NOT NULL,  -- bank_transfer | dva | card | crypto | treasury | payout
  transaction_type    TEXT NOT NULL,  -- DEPOSIT | WITHDRAWAL | PAYOUT | SWAP | REFUND | ANY
  preferred_provider  TEXT,           -- Optional hard preference (null = AI routing)
  excluded_providers  TEXT[] DEFAULT '{}',
  health_weight       NUMERIC(4,2)  NOT NULL DEFAULT 0.30,
  cost_weight         NUMERIC(4,2)  NOT NULL DEFAULT 0.25,
  latency_weight      NUMERIC(4,2)  NOT NULL DEFAULT 0.20,
  liquidity_weight    NUMERIC(4,2)  NOT NULL DEFAULT 0.25,
  smart_fx_enabled    BOOLEAN NOT NULL DEFAULT false,
  auto_rebalance      BOOLEAN NOT NULL DEFAULT false,
  max_failover_hops   INT NOT NULL DEFAULT 3,
  min_provider_score  INT NOT NULL DEFAULT 40,   -- Exclude providers below this score
  amount_floor        NUMERIC(20,8) DEFAULT 0,   -- Apply policy only above this amount
  amount_ceiling      NUMERIC(20,8),              -- Apply policy only below this amount
  requires_approval   BOOLEAN NOT NULL DEFAULT false,
  notes               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (currency, method, transaction_type)
);

-- Seed default routing policies
INSERT INTO routing_policies (currency, method, transaction_type, health_weight, cost_weight, latency_weight, liquidity_weight)
VALUES
  ('NGN', 'bank_transfer', 'DEPOSIT',    0.30, 0.20, 0.20, 0.30),
  ('NGN', 'bank_transfer', 'WITHDRAWAL', 0.30, 0.25, 0.15, 0.30),
  ('NGN', 'dva',           'DEPOSIT',    0.35, 0.15, 0.20, 0.30),
  ('NGN', 'payout',        'PAYOUT',     0.25, 0.30, 0.20, 0.25),
  ('USD', 'bank_transfer', 'DEPOSIT',    0.30, 0.20, 0.20, 0.30),
  ('USD', 'bank_transfer', 'WITHDRAWAL', 0.25, 0.30, 0.20, 0.25),
  ('USD', 'payout',        'PAYOUT',     0.25, 0.30, 0.20, 0.25),
  ('EUR', 'bank_transfer', 'DEPOSIT',    0.30, 0.20, 0.20, 0.30),
  ('GBP', 'bank_transfer', 'DEPOSIT',    0.30, 0.20, 0.20, 0.30),
  ('ANY', 'crypto',        'ANY',        0.40, 0.20, 0.20, 0.20)
ON CONFLICT (currency, method, transaction_type) DO NOTHING;

-- Every routing decision recorded for analytics and audit
CREATE TABLE IF NOT EXISTS routing_decisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id      TEXT,
  transaction_type    TEXT NOT NULL,
  currency            TEXT NOT NULL,
  amount              NUMERIC(20,8),
  method              TEXT,
  selected_provider   TEXT NOT NULL,
  fallback_providers  TEXT[] DEFAULT '{}',
  score_breakdown     JSONB DEFAULT '{}',
  latency_ms          INT,
  failover_hop        INT NOT NULL DEFAULT 0,
  failover_from       TEXT,
  decision_reason     TEXT,
  outcome             TEXT DEFAULT 'PENDING', -- PENDING | SUCCESS | FAILED | MANUAL_QUEUE
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_currency ON routing_decisions(currency);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_provider ON routing_decisions(selected_provider);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_created ON routing_decisions(created_at);

-- Failover configuration
CREATE TABLE IF NOT EXISTS failover_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency        TEXT NOT NULL DEFAULT 'ANY',
  method          TEXT NOT NULL DEFAULT 'ANY',
  provider_chain  TEXT[] NOT NULL DEFAULT '{}', -- Ordered failover chain
  manual_queue_on_exhaustion BOOLEAN NOT NULL DEFAULT true,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (currency, method)
);

INSERT INTO failover_config (currency, method, provider_chain) VALUES
  ('NGN', 'bank_transfer', ARRAY['fincra','anchor','paystack']),
  ('NGN', 'payout',        ARRAY['fincra','anchor','paystack']),
  ('USD', 'bank_transfer', ARRAY['fincra','anchor','grey']),
  ('USD', 'payout',        ARRAY['fincra','anchor','grey']),
  ('ANY', 'crypto',        ARRAY['nowpayments']),
  ('ANY', 'ANY',           ARRAY['fincra','anchor','paystack'])
ON CONFLICT (currency, method) DO NOTHING;
