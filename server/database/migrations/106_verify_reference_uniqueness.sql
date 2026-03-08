-- Migration 106: Production-Grade Fintech Hardening (FINAL)
-- Purpose:
--   1. Expand column lengths for references, providers, and currencies.
--   2. Enforce UNIQUE constraints for idempotency.
--   3. Enforce UNIQUE(user_id, currency) on wallets.
--   NOTE: user_id is ALREADY UUID in all tables (since Migration 025). No need to cast.

BEGIN;

-- 1. DROP DEPENDENT VIEWS (Required for ALTER on wallets_store.currency)
DROP VIEW IF EXISTS public.v_user_transactions CASCADE;
DROP VIEW IF EXISTS public.v_admin_transactions CASCADE;
DROP VIEW IF EXISTS public.v_revenue_summary CASCADE;
DROP VIEW IF EXISTS public.v_ledger_transactions CASCADE;
DROP VIEW IF EXISTS public.wallets CASCADE;

-- 2. HARDEN TRANSACTIONS TABLE
-- Expand reference_id to support long gateway references like tx_90175fc9b6cd4958917cb7d3895c17a9
ALTER TABLE public.transactions ALTER COLUMN reference_id TYPE VARCHAR(100);

-- Add UNIQUE constraint to reference_id for absolute idempotency
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_transaction_reference_id'
    ) THEN
        ALTER TABLE public.transactions ADD CONSTRAINT unique_transaction_reference_id UNIQUE (reference_id);
    END IF;
END $$;

-- 3. HARDEN PAYMENTS TABLE
ALTER TABLE public.payments ALTER COLUMN reference TYPE VARCHAR(100);
ALTER TABLE public.payments ALTER COLUMN provider TYPE VARCHAR(50);
ALTER TABLE public.payments ALTER COLUMN currency TYPE VARCHAR(10);
ALTER TABLE public.payments ALTER COLUMN status TYPE VARCHAR(20);

-- 4. HARDEN WALLETS_STORE TABLE
ALTER TABLE public.wallets_store ALTER COLUMN currency TYPE VARCHAR(10);
-- Expand address column to TEXT (was VARCHAR(20), causing inserts to fail)
ALTER TABLE public.wallets_store ALTER COLUMN address TYPE TEXT;

-- Enforce UNIQUE(user_id, currency)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_currency_network') THEN
        ALTER TABLE public.wallets_store DROP CONSTRAINT unique_user_currency_network;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_currency') THEN
        ALTER TABLE public.wallets_store ADD CONSTRAINT unique_user_currency UNIQUE (user_id, currency);
    END IF;
END $$;

-- 5. RECREATE VIEWS

-- A. Wallets View
CREATE VIEW public.wallets AS
SELECT 
    id, user_id, currency, network, address, is_frozen, provider, provider_reference, created_at, updated_at,
    balance, available_balance
FROM public.wallets_store;

-- B. User Transactions View
CREATE VIEW public.v_user_transactions AS
SELECT
    t.id, t.user_id, t.wallet_id, t.type, t.display_label, t.category, t.description,
    t.amount, t.currency, t.network, t.fee, t.spread_amount, t.exchange_rate, t.status,
    t.provider, t.provider_reference, t.external_hash, t.reference_id,
    t.counterparty_id, t.metadata, t.transaction_fee_breakdown,
    t.created_at, t.completed_at,
    w.currency AS wallet_currency,
    w.network AS wallet_network,
    CASE
        WHEN t.type IN ('TRANSFER_IN', 'SWAP_IN', 'DEPOSIT', 'AFFILIATE_COMMISSION', 'Digital Assets Purchase') THEN 'credit'
        WHEN t.type IN ('TRANSFER_OUT', 'SWAP_OUT', 'WITHDRAWAL', 'PAYOUT', 'SUBSCRIPTION_PAYMENT', 'AD_PAYMENT') THEN 'debit'
        ELSE 'other'
    END AS direction,
    cp.username AS counterparty_username,
    cp.full_name AS counterparty_name
FROM transactions t
LEFT JOIN wallets w ON w.id = t.wallet_id
LEFT JOIN profiles cp ON cp.id = t.counterparty_id;

-- C. Admin Transactions View
CREATE VIEW public.v_admin_transactions AS
SELECT
    t.id, t.user_id, p.username, p.email AS user_email, t.type, t.display_label,
    t.category, t.amount, t.currency, t.network, t.fee, t.spread_amount, t.status,
    t.provider, t.provider_reference, t.external_hash, t.metadata,
    t.created_at, t.completed_at, t.failed_at
FROM transactions t
LEFT JOIN profiles p ON p.id = t.user_id;

-- D. Revenue Summary View
CREATE VIEW public.v_revenue_summary AS
SELECT
    DATE_TRUNC('day', created_at) AS day,
    category AS revenue_type,
    SUM(fee) AS total_amount,
    COUNT(*) AS transaction_count,
    currency
FROM transactions
WHERE status = 'COMPLETED' AND fee > 0
GROUP BY day, category, currency;

-- 6. Final Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_provider_reference ON public.transactions(provider_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON public.transactions(reference_id);

COMMIT;
