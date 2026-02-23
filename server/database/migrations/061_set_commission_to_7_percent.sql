-- Migration 061: Set platform commission to 7% for all transactions
-- This covers funding, withdrawals, swaps, and internal transfers.

-- 1. Update commission_settings table
UPDATE commission_settings 
SET value = 0.07 
WHERE transaction_type IN ('TRANSFER_OUT', 'WITHDRAWAL', 'SWAP', 'FUNDING', 'DEPOSIT');

-- 2. Update admin_settings table fallbacks
UPDATE admin_settings 
SET value = '7.0'::jsonb 
WHERE key IN (
    'funding_fee_percentage', 
    'withdrawal_fee_percentage', 
    'spread_percentage'
);

-- Ensure defaults for all transaction types in commission_settings if they don't exist
-- Using a loop or individual inserts to be safe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM commission_settings WHERE transaction_type = 'SWAP') THEN
        INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
        VALUES ('SWAP', 'PERCENTAGE', 0.07, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM commission_settings WHERE transaction_type = 'TRANSFER_OUT') THEN
        INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
        VALUES ('TRANSFER_OUT', 'PERCENTAGE', 0.07, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM commission_settings WHERE transaction_type = 'WITHDRAWAL') THEN
        INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
        VALUES ('WITHDRAWAL', 'PERCENTAGE', 0.07, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM commission_settings WHERE transaction_type = 'FUNDING') THEN
        INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
        VALUES ('FUNDING', 'PERCENTAGE', 0.07, true);
    END IF;
END $$;

-- Ensure keys exist in admin_settings
INSERT INTO admin_settings (key, value)
SELECT 'funding_fee_percentage', '7.0'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'funding_fee_percentage');

INSERT INTO admin_settings (key, value)
SELECT 'withdrawal_fee_percentage', '7.0'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'withdrawal_fee_percentage');

INSERT INTO admin_settings (key, value)
SELECT 'spread_percentage', '7.0'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'spread_percentage');
