-- ============================================================
-- Migration 263: Banking Provider Registry & Capabilities
-- Migration 264: Routing Analytics
-- Phase 16 — Enterprise Financial Platform
-- ============================================================

-- ── 263: Banking Provider Registry ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banking_providers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key             TEXT NOT NULL UNIQUE,  -- fincra | anchor | paystack | grey | nowpayments
  display_name             TEXT NOT NULL,
  provider_type            TEXT NOT NULL DEFAULT 'PAYMENT', -- PAYMENT | BANKING | CRYPTO | FX
  environment              TEXT NOT NULL DEFAULT 'sandbox',
  is_enabled               BOOLEAN NOT NULL DEFAULT false,
  is_certified             BOOLEAN NOT NULL DEFAULT false,  -- Passed certification checklist
  certification_date       TIMESTAMPTZ,
  certified_by             UUID REFERENCES auth.users(id),
  -- Capability flags (Provider Certification Framework)
  cap_webhook_validation   BOOLEAN NOT NULL DEFAULT false,
  cap_idempotency          BOOLEAN NOT NULL DEFAULT false,
  cap_reversal             BOOLEAN NOT NULL DEFAULT false,
  cap_reconciliation       BOOLEAN NOT NULL DEFAULT false,
  cap_health_check         BOOLEAN NOT NULL DEFAULT false,
  cap_settlement_reporting BOOLEAN NOT NULL DEFAULT false,
  cap_audit_logging        BOOLEAN NOT NULL DEFAULT false,
  -- SLA targets
  sla_uptime_pct           NUMERIC(5,2) DEFAULT 99.9,
  sla_max_latency_ms       INT DEFAULT 3000,
  sla_settlement_days      SMALLINT DEFAULT 1,
  -- Contacts
  support_email            TEXT,
  webhook_url_configured   BOOLEAN NOT NULL DEFAULT false,
  api_key_last_rotated     TIMESTAMPTZ,
  metadata                 JSONB DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO banking_providers
  (provider_key, display_name, provider_type,
   cap_webhook_validation, cap_idempotency, cap_reversal, cap_reconciliation,
   cap_health_check, cap_settlement_reporting, cap_audit_logging, is_enabled)
VALUES
  ('fincra',      'Fincra',       'PAYMENT', true, true, true, true, true, true, true, true),
  ('anchor',      'Anchor',       'BANKING', true, true, true, true, true, true, true, true),
  ('paystack',    'Paystack',     'PAYMENT', true, true, false, true, true, true, true, true),
  ('grey',        'Grey',         'PAYMENT', true, false, false, true, true, false, true, false),
  ('nowpayments', 'NOWPayments',  'CRYPTO',  true, true, false, false, true, false, true, true)
ON CONFLICT (provider_key) DO NOTHING;

-- Fine-grained capability matrix per provider per operation
CREATE TABLE IF NOT EXISTS banking_capabilities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key    TEXT NOT NULL REFERENCES banking_providers(provider_key),
  operation       TEXT NOT NULL,  -- DEPOSIT | WITHDRAWAL | PAYOUT_DOMESTIC | PAYOUT_INTL | DVA | SWAP | REFUND
  currency        TEXT NOT NULL DEFAULT 'ANY',
  is_supported    BOOLEAN NOT NULL DEFAULT false,
  requires_kyc    BOOLEAN NOT NULL DEFAULT false,
  max_amount      NUMERIC(20,8),
  daily_limit     NUMERIC(20,8),
  notes           TEXT,
  UNIQUE (provider_key, operation, currency)
);

-- Seed capabilities
INSERT INTO banking_capabilities (provider_key, operation, currency, is_supported, requires_kyc) VALUES
  ('fincra',   'DEPOSIT',          'NGN',  true,  false),
  ('fincra',   'DEPOSIT',          'USD',  true,  false),
  ('fincra',   'PAYOUT_DOMESTIC',  'NGN',  true,  false),
  ('fincra',   'PAYOUT_INTL',      'USD',  true,  true),
  ('fincra',   'DVA',              'NGN',  true,  false),
  ('fincra',   'SWAP',             'ANY',  true,  false),
  ('anchor',   'DEPOSIT',          'NGN',  true,  false),
  ('anchor',   'PAYOUT_DOMESTIC',  'NGN',  true,  false),
  ('anchor',   'PAYOUT_INTL',      'USD',  false, true),  -- Disabled until enabled by Anchor
  ('anchor',   'DVA',              'NGN',  true,  false),
  ('paystack', 'DEPOSIT',          'NGN',  true,  false),
  ('paystack', 'PAYOUT_DOMESTIC',  'NGN',  true,  false),
  ('grey',     'DEPOSIT',          'USD',  true,  true),
  ('grey',     'PAYOUT_INTL',      'USD',  true,  true),
  ('grey',     'PAYOUT_INTL',      'EUR',  true,  true),
  ('nowpayments','DEPOSIT',        'ANY',  true,  false),
  ('nowpayments','WITHDRAWAL',     'ANY',  true,  false)
ON CONFLICT (provider_key, operation, currency) DO NOTHING;

-- ── 264: Routing Analytics ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routing_performance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  provider            TEXT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'ALL',
  transaction_type    TEXT NOT NULL DEFAULT 'ALL',
  total_routed        INT NOT NULL DEFAULT 0,
  total_succeeded     INT NOT NULL DEFAULT 0,
  total_failed        INT NOT NULL DEFAULT 0,
  total_failovers     INT NOT NULL DEFAULT 0,
  total_volume        NUMERIC(20,8) NOT NULL DEFAULT 0,
  avg_latency_ms      INT,
  avg_cost_pct        NUMERIC(6,4),
  success_rate        NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_routed > 0 THEN (total_succeeded::NUMERIC / total_routed * 100) ELSE 0 END
  ) STORED,
  failure_rate        NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_routed > 0 THEN (total_failed::NUMERIC / total_routed * 100) ELSE 0 END
  ) STORED,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, provider, currency, transaction_type)
);

CREATE INDEX IF NOT EXISTS idx_rp_date_provider ON routing_performance(date, provider);
