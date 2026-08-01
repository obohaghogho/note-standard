-- Migration 290: Enterprise Provider-Aware Payment Capabilities & Rails Engine
-- Creates payment_rails table and seeds default multi-provider capability registry

CREATE TABLE IF NOT EXISTS public.payment_rails (
  id VARCHAR(64) PRIMARY KEY,
  currency VARCHAR(12) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'fincra',
  rail_type VARCHAR(32) NOT NULL, -- e.g. card, bank_transfer, virtual_account, mobile_money, sepa, faster_payments, eft, ach, wire, fx_settlement
  name VARCHAR(64) NOT NULL,
  operation VARCHAR(16) NOT NULL, -- 'deposit', 'withdrawal', or 'both'
  priority INT NOT NULL DEFAULT 1,
  availability VARCHAR(16) NOT NULL DEFAULT 'ONLINE', -- 'ONLINE', 'DEGRADED', 'MAINTENANCE', 'OFFLINE'
  fee_fixed NUMERIC(12,2) DEFAULT 0,
  fee_percentage NUMERIC(5,2) DEFAULT 0,
  min_amount NUMERIC(14,2) DEFAULT 1,
  max_amount NUMERIC(14,2) DEFAULT 500000,
  required_tier VARCHAR(16) DEFAULT 'FREE', -- 'FREE', 'PRO', 'BUSINESS'
  settlement_time VARCHAR(64) DEFAULT 'Instant',
  recommended_score INT DEFAULT 5, -- 1 to 5 stars
  recommendation_badge VARCHAR(32) DEFAULT 'Recommended',
  supports_recurring BOOLEAN DEFAULT false,
  supports_refunds BOOLEAN DEFAULT true,
  supports_webhook BOOLEAN DEFAULT true,
  requires_beneficiary BOOLEAN DEFAULT false,
  requires_virtual_account BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_rails_currency_op ON public.payment_rails(currency, operation, availability);
CREATE INDEX IF NOT EXISTS idx_payment_rails_provider ON public.payment_rails(provider);

-- Seed default rails for all supported currencies
INSERT INTO public.payment_rails 
(id, currency, provider, rail_type, name, operation, priority, availability, fee_fixed, fee_percentage, min_amount, max_amount, required_tier, settlement_time, recommended_score, recommendation_badge)
VALUES
-- NGN Deposits & Withdrawals
('ngn_card_dep', 'NGN', 'fincra', 'card', 'Pay by Card', 'deposit', 1, 'ONLINE', 0, 1.50, 100, 500000, 'FREE', 'Instant', 5, 'Recommended'),
('ngn_bank_dep', 'NGN', 'fincra', 'bank_transfer', 'Bank Transfer', 'deposit', 2, 'ONLINE', 0, 0.00, 100, 10000000, 'FREE', 'Instant', 4, 'Best Value'),
('ngn_dva_dep', 'NGN', 'fincra', 'virtual_account', 'Virtual Dedicated Account', 'deposit', 3, 'ONLINE', 0, 0.00, 100, 10000000, 'FREE', 'Instant', 4, 'Automated'),
('ngn_bank_wd', 'NGN', 'fincra', 'bank_transfer', 'Local Bank Transfer', 'withdrawal', 1, 'ONLINE', 50, 0.00, 100, 10000000, 'FREE', 'Instant', 5, 'Recommended'),

-- USD Deposits & Withdrawals
('usd_card_dep', 'USD', 'fincra', 'card', 'Pay by Card', 'deposit', 1, 'ONLINE', 0, 2.50, 10, 5000, 'FREE', 'Instant', 5, 'Recommended'),
('usd_ach_dep', 'USD', 'fincra', 'ach', 'ACH Transfer', 'deposit', 2, 'ONLINE', 0, 0.50, 10, 50000, 'FREE', '1-2 Days', 4, 'Best Value'),
('usd_wire_dep', 'USD', 'fincra', 'wire', 'Wire Transfer', 'deposit', 3, 'ONLINE', 15, 0.00, 100, 500000, 'PRO', 'Same Day', 3, 'High Volume'),
('usd_dva_dep', 'USD', 'fincra', 'virtual_account', 'Virtual USD Account', 'deposit', 4, 'ONLINE', 0, 0.00, 20, 100000, 'FREE', 'Instant', 4, 'Automated'),
('usd_ach_wd', 'USD', 'fincra', 'ach', 'ACH Payout', 'withdrawal', 1, 'ONLINE', 1.00, 0.00, 10, 50000, 'FREE', '1-2 Days', 5, 'Recommended'),
('usd_wire_wd', 'USD', 'fincra', 'wire', 'Wire Payout', 'withdrawal', 2, 'ONLINE', 25.00, 0.00, 100, 500000, 'PRO', 'Same Day', 4, 'Fast Delivery'),

-- EUR Deposits & Withdrawals
('eur_card_dep', 'EUR', 'fincra', 'card', 'Pay by Card', 'deposit', 1, 'ONLINE', 0, 2.20, 10, 5000, 'FREE', 'Instant', 5, 'Recommended'),
('eur_sepa_dep', 'EUR', 'fincra', 'sepa', 'SEPA Transfer', 'deposit', 2, 'ONLINE', 0, 0.00, 10, 100000, 'FREE', 'Same Day', 4, 'Best Value'),
('eur_bank_dep', 'EUR', 'fincra', 'bank_transfer', 'Bank Transfer', 'deposit', 3, 'ONLINE', 0, 0.00, 10, 100000, 'FREE', 'Same Day', 3, 'Standard'),
('eur_sepa_wd', 'EUR', 'fincra', 'sepa', 'SEPA Transfer', 'withdrawal', 1, 'ONLINE', 0.50, 0.00, 10, 100000, 'FREE', 'Same Day', 5, 'Recommended'),

-- GBP Deposits & Withdrawals
('gbp_card_dep', 'GBP', 'fincra', 'card', 'Pay by Card', 'deposit', 1, 'ONLINE', 0, 2.20, 10, 5000, 'FREE', 'Instant', 5, 'Recommended'),
('gbp_fp_dep', 'GBP', 'fincra', 'faster_payments', 'UK Faster Payments', 'deposit', 2, 'ONLINE', 0, 0.00, 5, 250000, 'FREE', 'Instant', 4, 'Best Value'),
('gbp_bank_dep', 'GBP', 'fincra', 'bank_transfer', 'Bank Transfer', 'deposit', 3, 'ONLINE', 0, 0.00, 5, 250000, 'FREE', 'Instant', 3, 'Standard'),
('gbp_fp_wd', 'GBP', 'fincra', 'faster_payments', 'UK Faster Payments', 'withdrawal', 1, 'ONLINE', 0.50, 0.00, 5, 250000, 'FREE', 'Instant', 5, 'Recommended'),

-- TZS Deposits & Withdrawals (Tanzania - No Card)
('tzs_momo_dep', 'TZS', 'fincra', 'mobile_money', 'Mobile Money (M-Pesa / Tigo)', 'deposit', 1, 'ONLINE', 0, 1.00, 1000, 10000000, 'FREE', 'Instant', 5, 'Recommended'),
('tzs_bank_dep', 'TZS', 'fincra', 'bank_transfer', 'Bank Transfer', 'deposit', 2, 'ONLINE', 0, 0.00, 1000, 50000000, 'FREE', 'Same Day', 4, 'Best Value'),
('tzs_momo_wd', 'TZS', 'fincra', 'mobile_money', 'Mobile Money Payout', 'withdrawal', 1, 'ONLINE', 500, 0.00, 1000, 10000000, 'FREE', 'Instant', 5, 'Recommended'),
('tzs_bank_wd', 'TZS', 'fincra', 'bank_transfer', 'Local Bank Payout', 'withdrawal', 2, 'ONLINE', 1000, 0.00, 1000, 50000000, 'FREE', 'Same Day', 4, 'Standard'),

-- ZAR Deposits & Withdrawals (South Africa)
('zar_eft_dep', 'ZAR', 'fincra', 'eft', 'South Africa EFT', 'deposit', 1, 'ONLINE', 0, 0.80, 50, 500000, 'FREE', 'Instant', 5, 'Recommended'),
('zar_bank_dep', 'ZAR', 'fincra', 'bank_transfer', 'Bank Transfer', 'deposit', 2, 'ONLINE', 0, 0.00, 50, 1000000, 'FREE', 'Same Day', 4, 'Best Value'),
('zar_eft_wd', 'ZAR', 'fincra', 'eft', 'South Africa EFT Payout', 'withdrawal', 1, 'ONLINE', 10, 0.00, 50, 500000, 'FREE', 'Instant', 5, 'Recommended'),

-- GHS, KES, UGX, RWF, XAF, XOF Mobile Money & Bank Rails
('ghs_momo_dep', 'GHS', 'fincra', 'mobile_money', 'Mobile Money (MTN / Vodafone)', 'deposit', 1, 'ONLINE', 0, 1.00, 5, 20000, 'FREE', 'Instant', 5, 'Recommended'),
('ghs_bank_dep', 'GHS', 'fincra', 'bank_transfer', 'Bank Transfer', 'deposit', 2, 'ONLINE', 0, 0.00, 5, 50000, 'FREE', 'Same Day', 4, 'Best Value'),
('ghs_momo_wd', 'GHS', 'fincra', 'mobile_money', 'Mobile Money Payout', 'withdrawal', 1, 'ONLINE', 2, 0.00, 5, 20000, 'FREE', 'Instant', 5, 'Recommended'),

('kes_momo_dep', 'KES', 'fincra', 'mobile_money', 'Mobile Money (M-Pesa)', 'deposit', 1, 'ONLINE', 0, 1.00, 100, 300000, 'FREE', 'Instant', 5, 'Recommended'),
('kes_bank_dep', 'KES', 'fincra', 'bank_transfer', 'Bank Transfer', 'deposit', 2, 'ONLINE', 0, 0.00, 100, 1000000, 'FREE', 'Same Day', 4, 'Best Value'),
('kes_momo_wd', 'KES', 'fincra', 'mobile_money', 'Mobile Money Payout', 'withdrawal', 1, 'ONLINE', 50, 0.00, 100, 300000, 'FREE', 'Instant', 5, 'Recommended'),

-- CAD, MWK, ZMW, EGP, CNY, CNH Bank Transfers
('cad_bank_dep', 'CAD', 'fincra', 'bank_transfer', 'Bank Transfer / EFT', 'deposit', 1, 'ONLINE', 0, 0.00, 10, 100000, 'FREE', 'Same Day', 5, 'Recommended'),
('cad_bank_wd', 'CAD', 'fincra', 'bank_transfer', 'Bank Transfer Payout', 'withdrawal', 1, 'ONLINE', 2, 0.00, 10, 100000, 'FREE', 'Same Day', 5, 'Recommended'),

-- USDT / USDC FX Settlement Rails
('usdt_fx_dep', 'USDT', 'fincra', 'fx_settlement', 'Crypto FX Settlement', 'deposit', 1, 'ONLINE', 0, 0.00, 10, 1000000, 'FREE', 'Instant', 5, 'Recommended'),
('usdc_fx_dep', 'USDC', 'fincra', 'fx_settlement', 'Crypto FX Settlement', 'deposit', 1, 'ONLINE', 0, 0.00, 10, 1000000, 'FREE', 'Instant', 5, 'Recommended')
ON CONFLICT (id) DO UPDATE SET
  availability = EXCLUDED.availability,
  priority = EXCLUDED.priority,
  updated_at = NOW();
