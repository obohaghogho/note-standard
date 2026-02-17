-- 046_paystack_setup.sql
-- Add payment_status to ads table and ensure transactions table is ready for Paystack

DO $$
BEGIN
    -- 1. Add payment_status to ads if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ads' AND column_name = 'payment_status') THEN
        ALTER TABLE ads ADD COLUMN payment_status VARCHAR(20) DEFAULT 'unpaid';
    END IF;

    -- 2. Add index for payment_status
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ads_payment_status_idx') THEN
        CREATE INDEX ads_payment_status_idx ON ads(payment_status);
    END IF;

    -- 3. Ensure transactions table has external_hash (Paystack reference)
    -- It should exist from 025_crypto_wallet_system.sql, but just in case
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'external_hash') THEN
        ALTER TABLE transactions ADD COLUMN external_hash TEXT;
    END IF;

    -- 4. Ensure transactions table has metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'metadata') THEN
        ALTER TABLE transactions ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;

END $$;
