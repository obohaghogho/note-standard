-- Migration 090: Global Safe Model Wallet restructuring
-- This migration splits the name based currency and adds network-specific logic.
-- Corrected to target 'wallets_store' (underlying table for 'wallets' view).

BEGIN;

-- 1. DROP DEPENDENT VIEWS (Needed because CREATE OR REPLACE cannot change column names/order)
DROP VIEW IF EXISTS public.v_user_transactions CASCADE;
DROP VIEW IF EXISTS public.v_admin_transactions CASCADE;
DROP VIEW IF EXISTS public.v_revenue_summary CASCADE;
DROP VIEW IF EXISTS public.v_ledger_transactions CASCADE;
DROP VIEW IF EXISTS public.wallets CASCADE;

-- 2. Add new columns to wallets_store
ALTER TABLE public.wallets_store ADD COLUMN IF NOT EXISTS network VARCHAR(20);
ALTER TABLE public.wallets_store ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'internal';
ALTER TABLE public.wallets_store ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(100);

-- 3. Add network column to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS network VARCHAR(20);

-- 4. Data Migration: Split existing currency strings (e.g., 'USDT_TRC20')
-- For wallets_store
UPDATE public.wallets_store 
SET network = split_part(currency, '_', 2),
    currency = split_part(currency, '_', 1)
WHERE currency LIKE '%\_%';

-- For transactions
UPDATE public.transactions 
SET network = split_part(currency, '_', 2),
    currency = split_part(currency, '_', 1)
WHERE currency LIKE '%\_%';

-- 5. Set defaults for known crypto that didn't have underscores
UPDATE public.wallets_store SET network = 'bitcoin', provider = 'nowpayments' WHERE currency = 'BTC' AND (network IS NULL OR network = '');
UPDATE public.wallets_store SET network = 'ethereum', provider = 'nowpayments' WHERE currency = 'ETH' AND (network IS NULL OR network = '');

-- 6. Set defaults for fiat and other internal assets
UPDATE public.wallets_store SET network = 'native', provider = 'internal' WHERE (network IS NULL OR network = '');

-- 7. Update provider for known crypto networks
UPDATE public.wallets_store 
SET provider = 'nowpayments' 
WHERE network IN ('TRC20', 'ERC20', 'BEP20', 'POLYGON', 'bitcoin', 'ethereum');

-- 8. Sync provider_reference and address with nowpayments_deposit_addresses
UPDATE public.wallets_store w
SET address = nda.address,
    provider_reference = nda.payment_id
FROM public.nowpayments_deposit_addresses nda
WHERE w.user_id = nda.user_id 
  AND (w.currency = nda.asset OR (w.currency || '_' || w.network = nda.asset))
  AND nda.status = 'active'
  AND w.provider = 'nowpayments';

-- 9. Update constraints on wallets_store
-- Safe drop of old unique constraint and add new granular constraint
DO $$
BEGIN
    -- Drop old constraint if exists
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_currency') THEN
        ALTER TABLE public.wallets_store DROP CONSTRAINT unique_user_currency;
    END IF;

    -- Add the new granular constraint if NOT exists
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_currency_network') THEN
        ALTER TABLE public.wallets_store ADD CONSTRAINT unique_user_currency_network UNIQUE (user_id, currency, network);
    END IF;
END $$;

-- 10. RECREATE VIEWS

-- A. Wallets View (Expands to include network/provider)
CREATE VIEW public.wallets AS
SELECT 
    id, user_id, currency, network, address, is_frozen, provider, provider_reference, created_at, updated_at,
    balance, available_balance
FROM public.wallets_store;

-- B. User Transactions View (Expands to include network)
CREATE VIEW v_user_transactions AS
SELECT
    t.id, t.user_id, t.wallet_id, t.type, t.display_label, t.category, t.description,
    t.amount, t.currency, t.network, t.fee, t.spread_amount, t.exchange_rate, t.status,
    t.provider, t.provider_reference, t.external_hash, t.reference_id,
    t.counterparty_id, t.metadata, t.transaction_fee_breakdown,
    t.created_at, t.completed_at,
    w.currency AS wallet_currency,
    w.network AS wallet_network,
    CASE
        WHEN t.type IN ('TRANSFER_IN', 'SWAP_IN', 'DEPOSIT', 'AFFILIATE_COMMISSION') THEN 'credit'
        WHEN t.type IN ('TRANSFER_OUT', 'SWAP_OUT', 'WITHDRAWAL', 'PAYOUT', 'SUBSCRIPTION_PAYMENT', 'AD_PAYMENT') THEN 'debit'
        ELSE 'other'
    END AS direction,
    cp.username AS counterparty_username,
    cp.full_name AS counterparty_name
FROM transactions t
LEFT JOIN wallets w ON w.id = t.wallet_id
LEFT JOIN profiles cp ON cp.id = t.counterparty_id;

-- C. Admin Transactions View
CREATE VIEW v_admin_transactions AS
SELECT
    t.id, t.user_id, p.username, p.email AS user_email, t.type, t.display_label,
    t.category, t.amount, t.currency, t.network, t.fee, t.spread_amount, t.status,
    t.provider, t.provider_reference, t.external_hash, t.metadata,
    t.created_at, t.completed_at, t.failed_at
FROM transactions t
LEFT JOIN profiles p ON p.id = t.user_id;

-- D. Revenue Summary View
CREATE VIEW v_revenue_summary AS
SELECT
    DATE_TRUNC('day', created_at) AS day,
    revenue_type,
    SUM(amount) AS total_amount,
    COUNT(*) AS transaction_count,
    currency
FROM revenue_logs
GROUP BY day, revenue_type, currency;

COMMIT;
