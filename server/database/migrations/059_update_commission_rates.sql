-- Migration: 059_update_commission_rates.sql
-- Description: Reduce affiliate commission to 2% and set platform commission to 3% for all crypto transactions.

-- 1. Update Affiliate Commission to 2%
UPDATE admin_settings 
SET value = '2.0'::jsonb 
WHERE key = 'affiliate_percentage';

ALTER TABLE affiliate_referrals 
ALTER COLUMN commission_percentage SET DEFAULT 2.0;

UPDATE affiliate_referrals 
SET commission_percentage = 2.0;

-- 2. Set Platform Commission to 3% for all transactions
-- This covers internal transfers, withdrawals, and swaps

-- Update existing settings in commission_settings table
-- (Assuming 0.03 represents 3%)
UPDATE commission_settings 
SET value = 0.03 
WHERE transaction_type IN ('TRANSFER_OUT', 'WITHDRAWAL', 'SWAP', 'DEPOSIT');

-- If some types don't exist yet, we should insert defaults for crypto
-- Note: 'DEPOSIT' is sometimes referred to as 'FUNDING' in other tables

-- 3. Update Admin Settings Fallbacks
UPDATE admin_settings 
SET value = '3.0'::jsonb 
WHERE key IN (
    'funding_fee_percentage', 
    'withdrawal_fee_percentage', 
    'spread_percentage'
);

-- Reset PRO/BUSINESS discounts if they were hardcoded to ensure 3% is the base
-- Actually, the code applies discounts as multiples (rate * 0.8), which is fine.
-- 3% base -> PRO gets 2.4%, BUSINESS gets 1.5%.

-- Ensure we have a default swap fee if not present
INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
VALUES ('SWAP', 'PERCENTAGE', 0.03, true)
ON CONFLICT (transaction_type, currency) DO UPDATE SET value = 0.03;

INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
VALUES ('TRANSFER_OUT', 'PERCENTAGE', 0.03, true)
ON CONFLICT (transaction_type, currency) DO UPDATE SET value = 0.03;

INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
VALUES ('WITHDRAWAL', 'PERCENTAGE', 0.03, true)
ON CONFLICT (transaction_type, currency) DO UPDATE SET value = 0.03;
