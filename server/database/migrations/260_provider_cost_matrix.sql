-- ============================================================
-- Migration 260: Provider Cost Matrix
-- Phase 16 — Enterprise Financial Platform
-- ============================================================

-- Per-provider fee structure for cost-optimal routing
CREATE TABLE IF NOT EXISTS provider_cost_matrix (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         TEXT NOT NULL,
  operation_type   TEXT NOT NULL,   -- DEPOSIT | WITHDRAWAL | PAYOUT | SWAP | DVA | REFUND
  currency         TEXT NOT NULL DEFAULT 'ANY',
  fee_percentage   NUMERIC(6,4)  NOT NULL DEFAULT 0,  -- e.g. 1.5 = 1.5%
  flat_fee         NUMERIC(20,8) NOT NULL DEFAULT 0,  -- Fixed fee in currency units
  min_fee          NUMERIC(20,8) NOT NULL DEFAULT 0,  -- Minimum fee floor
  max_fee          NUMERIC(20,8),                      -- Maximum fee ceiling (null = no cap)
  fee_currency     TEXT NOT NULL DEFAULT 'NGN',        -- Currency the fee is charged in
  settlement_days  SMALLINT NOT NULL DEFAULT 1,        -- T+ settlement window
  source           TEXT NOT NULL DEFAULT 'MANUAL',     -- MANUAL | API | CONTRACT
  effective_from   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until  TIMESTAMPTZ,
  notes            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, operation_type, currency)
);

-- Seed known provider fee structures (approximate — update with contractual rates)
INSERT INTO provider_cost_matrix (provider, operation_type, currency, fee_percentage, flat_fee, min_fee, settlement_days, notes)
VALUES
  -- Fincra
  ('fincra', 'DEPOSIT',    'NGN', 1.50, 0,    0,    0, 'Fincra standard card collection fee'),
  ('fincra', 'PAYOUT',     'NGN', 0.75, 50,   50,   1, 'Fincra NGN payout — per NIP guidelines'),
  ('fincra', 'PAYOUT',     'USD', 1.00, 0,    0,    2, 'Fincra international payout'),
  ('fincra', 'SWAP',       'ANY', 1.50, 0,    0,    0, 'Fincra FX conversion'),
  ('fincra', 'DVA',        'NGN', 0.00, 0,    0,    0, 'Virtual account provision is free'),
  -- Anchor
  ('anchor', 'DEPOSIT',    'NGN', 0.00, 0,    0,    0, 'Anchor incoming NIP — no charge'),
  ('anchor', 'PAYOUT',     'NGN', 0.50, 50,   50,   1, 'Anchor NIP outbound transfer'),
  ('anchor', 'PAYOUT',     'USD', 1.00, 0,    0,    2, 'Anchor international (when enabled)'),
  ('anchor', 'DVA',        'NGN', 0.00, 0,    0,    0, 'Virtual NUBAN provision is free'),
  -- Paystack
  ('paystack', 'DEPOSIT',  'NGN', 1.50, 0,    0,    0, 'Paystack card collection'),
  ('paystack', 'PAYOUT',   'NGN', 0.75, 50,   50,   1, 'Paystack NGN transfer'),
  -- Grey
  ('grey',   'PAYOUT',     'USD', 0.50, 0,    100,  2, 'Grey USD international payout'),
  ('grey',   'PAYOUT',     'EUR', 0.50, 0,    0,    2, 'Grey EUR international payout'),
  -- NOWPayments
  ('nowpayments', 'DEPOSIT','ANY', 0.50, 0,   0,    0, 'NOWPayments crypto invoice'),
  ('nowpayments', 'PAYOUT', 'ANY', 1.00, 0,   0,    0, 'NOWPayments crypto withdrawal')
ON CONFLICT (provider, operation_type, currency) DO NOTHING;

-- View: compute cost score for routing engine (higher score = cheaper)
CREATE OR REPLACE VIEW provider_cost_scores AS
SELECT
  provider,
  currency,
  operation_type,
  -- Normalise: lower cost → higher score (0–30 scale)
  GREATEST(0, 30 - ROUND((fee_percentage * 10 + CASE WHEN flat_fee > 0 THEN 5 ELSE 0 END)::NUMERIC)) AS cost_score,
  fee_percentage,
  flat_fee,
  settlement_days
FROM provider_cost_matrix
WHERE (effective_until IS NULL OR effective_until > NOW());
