-- Migration: Enhance Transactions for Multi-Gateway Support
-- Date: 2026-02-12

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS provider TEXT,
ADD COLUMN IF NOT EXISTS provider_reference TEXT,
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS external_hash TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster lookups by reference (critical for webhooks)
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON transactions (reference_id);
CREATE INDEX IF NOT EXISTS idx_transactions_provider_reference ON transactions (provider_reference);

-- Update existing transactions' user_id from wallet_id if possible
UPDATE transactions t
SET user_id = w.user_id
FROM wallets w
WHERE t.wallet_id = w.id AND t.user_id IS NULL;
