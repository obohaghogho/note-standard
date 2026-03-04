-- Migration 086: Add External Payout Tracking
--
-- BACKGROUND:
--   To comply with the non-custodial License-Light facilitator model, 
--   the platform handles user withdrawals by directly calling licensed
--   third-party provider APIs (Flutterwave for fiat, NOWPayments for crypto).
--   
--   This migration adds the necessary columns to track the status and ID 
--   of those external disbursements on the internal ledger transactions.

-- Step 1: Add external_payout_id to track the provider's reference
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS external_payout_id VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS external_payout_status VARCHAR(50) NULL;

COMMENT ON COLUMN transactions.external_payout_id IS 
    'The transfer ID from Flutterwave or payout ID from NOWPayments for disbursements';

COMMENT ON COLUMN transactions.external_payout_status IS 
    'The status of the payout at the external provider (e.g. PROCESSING, SUCCESSFUL, FAILED)';

-- Step 2: Index external_payout_id for faster webhook reconciliation
CREATE INDEX IF NOT EXISTS idx_transactions_external_payout_id ON transactions(external_payout_id);
