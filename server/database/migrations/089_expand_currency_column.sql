-- 089_expand_currency_column.sql
-- Expand currency columns at the core level.
-- Handles View dependencies by dropping and recreating them.

BEGIN;

-- 1. DROP DEPENDENT VIEWS (CASCADE will handle nested dependencies)
DROP VIEW IF EXISTS public.v_user_transactions CASCADE;
DROP VIEW IF EXISTS public.v_admin_transactions CASCADE;
DROP VIEW IF EXISTS public.v_revenue_summary CASCADE;
DROP VIEW IF EXISTS public.v_ledger_transactions CASCADE;
DROP VIEW IF EXISTS public.wallets CASCADE;

-- 2. ALTER TABLE COLUMNS
-- Wallets Store
ALTER TABLE public.wallets_store ALTER COLUMN currency TYPE VARCHAR(25);

-- Transactions 
ALTER TABLE public.transactions ALTER COLUMN currency TYPE VARCHAR(25);
ALTER TABLE public.transactions ALTER COLUMN from_currency TYPE VARCHAR(25);
ALTER TABLE public.transactions ALTER COLUMN to_currency TYPE VARCHAR(25);

-- Ledger Entries
ALTER TABLE public.ledger_entries ALTER COLUMN currency TYPE VARCHAR(25);

-- Exchange Rates (Pair column is BASE-QUOTE)
ALTER TABLE public.exchange_rates ALTER COLUMN pair TYPE VARCHAR(50);

-- NOWPayments Addresses (Asset and pay_currency)
ALTER TABLE public.nowpayments_deposit_addresses ALTER COLUMN asset TYPE VARCHAR(30);
ALTER TABLE public.nowpayments_deposit_addresses ALTER COLUMN pay_currency TYPE VARCHAR(30);


-- 3. RECREATE VIEWS

-- A. Wallets View (Latest definition from Migration 074)
CREATE VIEW public.wallets AS
SELECT 
    id, user_id, currency, address, is_frozen, created_at, updated_at,
    balance, available_balance
FROM public.wallets_store;

-- B. User Transactions View (Definition from Migration 066)
CREATE VIEW v_user_transactions AS
SELECT
    t.id, t.user_id, t.wallet_id, t.type, t.display_label, t.category, t.description,
    t.amount, t.currency, t.fee, t.spread_amount, t.exchange_rate, t.status,
    t.provider, t.provider_reference, t.external_hash, t.reference_id,
    t.counterparty_id, t.metadata, t.transaction_fee_breakdown,
    t.created_at, t.completed_at,
    w.currency AS wallet_currency,
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

-- C. Admin Transactions View (Definition from Migration 066)
CREATE VIEW v_admin_transactions AS
SELECT
    t.id, t.user_id, p.username, p.email AS user_email, t.type, t.display_label,
    t.category, t.amount, t.currency, t.fee, t.spread_amount, t.status,
    t.provider, t.provider_reference, t.external_hash, t.metadata,
    t.created_at, t.completed_at, t.failed_at
FROM transactions t
LEFT JOIN profiles p ON p.id = t.user_id;

-- D. Revenue Summary View (Definition from Migration 066)
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
