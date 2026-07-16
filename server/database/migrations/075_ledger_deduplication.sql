-- ============================================================================
-- Migration 075: LEDGER DEDUPLICATION & BALANCE RECONCILIATION
-- ============================================================================
-- Purpose:
--   1. Identification and removal of duplicate ledger entries.
--   2. Enforcement of unique constraints to prevent future duplicates.
--   3. Reconciliation of negative balances by resetting them to zero. (As requested)
--   4. Full balance resync from the cleaned ledger source of truth.
-- ============================================================================

BEGIN;

-- 1. IDENTIFY AND REMOVE DUPLICATE LEDGER ENTRIES
-- We keep the "original" entry (lowest UUID/earliest) and delete others with same (ref, wallet, type).
-- This identifies entries that violated the intended logic of Migration 072.
DELETE FROM public.ledger_entries a
USING public.ledger_entries b
WHERE a.id > b.id 
  AND a.reference = b.reference 
  AND a.wallet_id = b.wallet_id 
  AND a.type = b.type;

-- 2. ENFORCE UNIQUE CONSTRAINT
-- Now that duplicates are gone, we can safely enforce the constraint.
-- If it already exists, this will do nothing (or we drop and recreate to be sure).
ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS unique_ledger_entry;
ALTER TABLE public.ledger_entries ADD CONSTRAINT unique_ledger_entry UNIQUE (reference, wallet_id, type);

-- 3. RESET NEGATIVE BALANCES
-- Users who overspent due to inflated balances (from duplicates) will have their balances reset to 0.
-- We audit these resets for records.
INSERT INTO public.security_audit_logs (user_id, event_type, severity, description, payload)
SELECT 
    user_id, 
    'BALANCE_RESET_NEGATIVE', 
    'INFO', 
    'Negative balance reset to zero during reconciliation', 
    jsonb_build_object('wallet_id', id, 'currency', currency, 'old_balance', balance)
FROM public.wallets_store
WHERE balance < 0 OR available_balance < 0;

UPDATE public.wallets_store
SET balance = GREATEST(balance, 0),
    available_balance = GREATEST(available_balance, 0),
    updated_at = NOW()
WHERE balance < 0 OR available_balance < 0;

-- 4. FULL RECONCILIATION (Resync from Clean Ledger)
-- Ensure all wallet balances perfectly match the SUM(amount) of their ledger_entries.
UPDATE public.wallets_store w
SET 
    balance = (
        SELECT COALESCE(SUM(amount), 0)
        FROM public.ledger_entries
        WHERE wallet_id = w.id AND status = 'confirmed'
    ),
    available_balance = (
        SELECT (COALESCE(SUM(amount), 0) - COALESCE((SELECT SUM(ABS(amount)) FROM public.ledger_entries WHERE wallet_id = w.id AND status = 'pending' AND amount < 0), 0))
        FROM public.ledger_entries
        WHERE wallet_id = w.id AND status = 'confirmed'
    );

-- Double check for any missed negatives after resync (unlikely but safe)
UPDATE public.wallets_store
SET balance = 0,
    available_balance = 0
WHERE balance < 0 OR available_balance < 0;

COMMIT;
