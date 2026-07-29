-- ============================================================
-- Migration 266: Payment Policy Engine
-- Migration 267: Customer Risk Profiles
-- Migration 268: Settlement Calendar
-- Phase 16 — Enterprise Financial Platform
-- ============================================================

-- ── Payment Policy Engine ─────────────────────────────────────────────────────
-- Configurable rules evaluated by CFO before routing — no hardcoded behavior
CREATE TABLE IF NOT EXISTS payment_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name         TEXT NOT NULL UNIQUE,
  description         TEXT,
  -- Conditions (all must match — AND logic)
  cond_currency       TEXT,           -- null = any
  cond_operation_type TEXT,           -- null = any
  cond_method         TEXT,           -- null = any
  cond_min_amount     NUMERIC(20,8),  -- null = no floor
  cond_max_amount     NUMERIC(20,8),  -- null = no ceiling
  cond_country_code   TEXT,           -- null = any
  cond_user_risk_tier TEXT,           -- null = any (LOW | MEDIUM | HIGH)
  cond_time_from      TIME,           -- null = any hour
  cond_time_until     TIME,
  -- Actions
  action_require_approval   BOOLEAN NOT NULL DEFAULT false,
  action_force_provider     TEXT,     -- null = AI routing
  action_block_providers    TEXT[],   -- Providers to exclude
  action_add_delay_ms       INT,      -- Artificial processing delay (compliance)
  action_require_2fa        BOOLEAN NOT NULL DEFAULT false,
  action_max_daily_volume   NUMERIC(20,8),
  action_flag_for_review    BOOLEAN NOT NULL DEFAULT false,
  action_notify_admin       BOOLEAN NOT NULL DEFAULT false,
  action_metadata           JSONB DEFAULT '{}',
  -- Meta
  priority            INT NOT NULL DEFAULT 100,   -- Lower = evaluated first
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed example policies (operator-editable)
INSERT INTO payment_policies
  (policy_name, description, cond_operation_type, cond_min_amount, cond_currency,
   action_require_approval, action_notify_admin, priority)
VALUES
  ('Large USD Payout Approval',
   'USD payouts above $10,000 require manual approval',
   'PAYOUT', 10000, 'USD', true, true, 10),
  ('High Risk User Monitoring',
   'Flag transactions from HIGH risk tier users for review',
   NULL, NULL, NULL, false, true, 20)
ON CONFLICT (policy_name) DO NOTHING;

-- ── Customer Risk Profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_risk_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  -- Risk tier
  risk_tier               TEXT NOT NULL DEFAULT 'LOW',  -- LOW | MEDIUM | HIGH | BLOCKED
  risk_score              SMALLINT NOT NULL DEFAULT 0,  -- 0–100 (higher = riskier)
  -- Score components
  velocity_score          SMALLINT DEFAULT 0,
  geolocation_score       SMALLINT DEFAULT 0,
  device_fingerprint_score SMALLINT DEFAULT 0,
  behavioral_score        SMALLINT DEFAULT 0,
  sanctions_score         SMALLINT DEFAULT 0,
  aml_score               SMALLINT DEFAULT 0,
  fraud_history_score     SMALLINT DEFAULT 0,
  -- Routing implications
  requires_manual_review  BOOLEAN NOT NULL DEFAULT false,
  requires_2fa_for_payouts BOOLEAN NOT NULL DEFAULT false,
  max_single_transaction  NUMERIC(20,8),   -- null = standard limits
  max_daily_volume        NUMERIC(20,8),
  allowed_providers       TEXT[],           -- null = all providers
  blocked_providers       TEXT[] DEFAULT '{}',
  -- History
  last_incident_at        TIMESTAMPTZ,
  last_incident_type      TEXT,
  reviewed_by             UUID REFERENCES auth.users(id),
  reviewed_at             TIMESTAMPTZ,
  review_notes            TEXT,
  auto_review_at          TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  -- Counts
  total_transactions      INT DEFAULT 0,
  flagged_count           INT DEFAULT 0,
  blocked_count           INT DEFAULT 0,
  metadata                JSONB DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crp_tier      ON customer_risk_profiles(risk_tier);
CREATE INDEX IF NOT EXISTS idx_crp_review_at ON customer_risk_profiles(auto_review_at)
  WHERE risk_tier IN ('MEDIUM','HIGH');

-- ── Settlement Calendar ────────────────────────────────────────────────────────
-- T+N settlement awareness per provider + currency
CREATE TABLE IF NOT EXISTS settlement_calendar (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT NOT NULL,
  currency            TEXT NOT NULL,
  settlement_model    TEXT NOT NULL DEFAULT 'T+1',  -- T+0 | T+1 | T+2 | T+3
  settlement_days     SMALLINT NOT NULL DEFAULT 1,
  cutoff_time         TIME,          -- Transactions after this time go to next window
  cutoff_timezone     TEXT DEFAULT 'Africa/Lagos',
  -- Holiday overrides
  excludes_weekends   BOOLEAN NOT NULL DEFAULT true,
  holiday_calendar    TEXT DEFAULT 'NG', -- Country code for holiday schedule
  -- Expected settlement hours from transaction time
  min_hours           INT DEFAULT 0,
  max_hours           INT DEFAULT 48,
  typical_hours       INT DEFAULT 24,
  notes               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, currency)
);

INSERT INTO settlement_calendar (provider, currency, settlement_model, settlement_days, cutoff_time, min_hours, max_hours, typical_hours)
VALUES
  ('fincra',      'NGN', 'T+1', 1, '16:00', 2,  36, 24),
  ('fincra',      'USD', 'T+2', 2, '14:00', 24, 72, 48),
  ('fincra',      'EUR', 'T+2', 2, '14:00', 24, 72, 48),
  ('anchor',      'NGN', 'T+0', 0, '23:00', 0,  2,  1),   -- Anchor NIP is near-real-time
  ('anchor',      'USD', 'T+2', 2, '14:00', 24, 72, 48),
  ('paystack',    'NGN', 'T+1', 1, '16:00', 2,  36, 24),
  ('grey',        'USD', 'T+2', 2, '14:00', 24, 72, 48),
  ('grey',        'EUR', 'T+2', 2, '14:00', 24, 72, 48),
  ('nowpayments', 'ANY', 'T+0', 0, NULL,    0,  24, 1)
ON CONFLICT (provider, currency) DO NOTHING;
