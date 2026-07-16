-- ============================================================================
-- Migration 181: Ledger Unification & Data Consolidation (Robust Edition)
-- ============================================================================
-- Purpose:
--   1. Migrates historical transaction data from legacy 'ledger_entries'.
--   2. Autonomously bootstraps SYSTEM_LP accounts to satisfy SUM=0 integrity.
--   3. Uses non-conflicting existence checks for maximum compatibility.
-- ============================================================================

BEGIN;

-- CLEANUP (In case of previous failed attempts)
DELETE FROM public.ledger_entries_v6 WHERE transaction_id IN (
    SELECT id FROM public.ledger_transactions_v6 WHERE type = 'LEGACY_BOOTSTRAP'
);
DELETE FROM public.ledger_transactions_v6 WHERE type = 'LEGACY_BOOTSTRAP';

-- 0. BOOTSTRAP MISSING LP ACCOUNTS
-- We must have a system counterparty for every currency to satisfy double-entry invariants.
DO $$
DECLARE
    v_sys_id UUID;
    v_currency RECORD;
    v_lp_address TEXT;
BEGIN
    -- Choose any valid identity to host the internal system wallets
    SELECT id INTO v_sys_id FROM public.profiles LIMIT 1;

    IF v_sys_id IS NOT NULL THEN
        -- Find all currencies currently held by any user
        FOR v_currency IN SELECT DISTINCT currency FROM public.wallets_store LOOP
            v_lp_address := 'SYSTEM_LP_' || v_currency.currency;
            
            -- Create LP wallet if not exists using a safe existence check
            -- This avoids "ON CONFLICT" errors when unique indices are missing.
            IF NOT EXISTS (SELECT 1 FROM public.wallets_store WHERE address = v_lp_address) THEN
                INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider)
                VALUES (uuid_generate_v4(), v_sys_id, v_currency.currency, 'INTERNAL', v_lp_address, 'internal');
            END IF;
        END LOOP;
    END IF;
END $$;

-- 1. Create Transaction Headers
INSERT INTO public.ledger_transactions_v6 (id, idempotency_key, type, status, metadata)
SELECT 
    uuid_generate_v4(), 
    'legacy_migration_' || id, 
    'LEGACY_BOOTSTRAP', 
    'SETTLED', 
    jsonb_build_object('migrated_at', NOW(), 'original_status', status, 'original_type', type)
FROM public.ledger_entries
WHERE LOWER(status) IN ('confirmed', 'settled', 'success', 'completed')
  AND amount != 0
ON CONFLICT DO NOTHING;

-- 2. Migrate Ledger Data (The Wallet Side)
INSERT INTO public.ledger_entries_v6 (
    transaction_id,
    wallet_id,
    user_id,
    currency,
    amount,
    side
)
SELECT 
    tx.id as transaction_id,
    le.wallet_id,
    w.user_id,
    w.currency,
    le.amount as amount,
    CASE WHEN le.amount >= 0 THEN 'CREDIT' ELSE 'DEBIT' END as side
FROM public.ledger_entries le
JOIN public.wallets_store w ON le.wallet_id = w.id
JOIN public.ledger_transactions_v6 tx ON tx.idempotency_key = 'legacy_migration_' || le.id
WHERE LOWER(le.status) IN ('confirmed', 'settled', 'success', 'completed')
  AND le.amount != 0
ON CONFLICT DO NOTHING;

-- 3. Create Balancing Entries (The System LP Side)
INSERT INTO public.ledger_entries_v6 (
    transaction_id,
    wallet_id,
    user_id,
    currency,
    amount,
    side
)
SELECT 
    tx.id as transaction_id,
    lp.id as wallet_id,
    lp.user_id,
    lp.currency,
    -le.amount as amount,
    CASE WHEN le.amount >= 0 THEN 'DEBIT' ELSE 'CREDIT' END as side
FROM public.ledger_entries le
JOIN public.wallets_store w ON le.wallet_id = w.id
JOIN public.wallets_store lp ON lp.address = 'SYSTEM_LP_' || w.currency
JOIN public.ledger_transactions_v6 tx ON tx.idempotency_key = 'legacy_migration_' || le.id
WHERE LOWER(le.status) IN ('confirmed', 'settled', 'success', 'completed')
  AND le.amount != 0
ON CONFLICT DO NOTHING;

-- 4. FINAL SYSTEM-WIDE RE-MATERIALIZATION
DO $$
DECLARE
    v_wallet RECORD;
BEGIN
    FOR v_wallet IN SELECT id FROM public.wallets_store LOOP
        PERFORM public.sync_wallet_balance_from_ledger(v_wallet.id);
    END LOOP;
END $$;

COMMIT;
