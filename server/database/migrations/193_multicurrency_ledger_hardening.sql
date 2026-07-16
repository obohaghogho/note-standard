-- Migration: 193_multicurrency_ledger_hardening.sql
-- Description: Hardens the transactions table to support true multi-currency accounting by 
-- decoupling the display currency from the processing and settlement currencies.

-- 1. Add Processing Currency & Amount
-- This represents exactly what is sent to the payment gateway (e.g. USD 50.00)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS processing_currency VARCHAR(10);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS processing_amount NUMERIC(38,18);

-- 2. Add Settlement Currency & Amount
-- This represents exactly what the treasury actually received after provider payout (e.g. NGN 75000.00)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS settlement_currency VARCHAR(10);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS settled_amount NUMERIC(38,18);

-- 3. Add Exchange Rate Snapshot
-- Stores the exact rate used if any internal conversion occurred BEFORE passing to the gateway
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate_snapshot NUMERIC(38,18);

-- 4. Ensure Idempotency Key is strictly unique
-- (If this constraint already exists, it will be skipped by the DB, but good practice to explicitly define)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_idempotency_key_key'
    ) THEN
        ALTER TABLE transactions ADD CONSTRAINT transactions_idempotency_key_key UNIQUE (idempotency_key);
    END IF;
END $$;

-- 5. Add Transaction Status Enums if they don't exist
-- We will use text constraints rather than Postgres ENUMs for easier future-proofing, 
-- but we update the comment to reflect the strict state machine.
COMMENT ON COLUMN transactions.status IS 'Strict State Machine: CREATED, INITIALIZED, PENDING, PROCESSING, SUCCESS, FAILED, REVERSED, RECONCILING, SETTLED, QUARANTINED';
