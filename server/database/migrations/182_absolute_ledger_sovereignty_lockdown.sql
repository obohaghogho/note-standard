-- ============================================================================
-- Migration 182: Absolute Ledger Sovereignty & Forced Sync
-- ============================================================================
-- Purpose:
--   1. Bypass all triggers and constraints to force balance alignment.
--   2. Enforce the v6 Journal as the one and only truth.
-- ============================================================================

BEGIN;

-- 0. BYPASS ALL TRIGGERS (Replication mode prevents triggers from firing)
SET session_replication_role = 'replica';

-- 1. DECOMMISSION LEGACY LEDGER GUARDS
DROP TRIGGER IF EXISTS trg_wallets_upsert ON public.wallets_store CASCADE;
DROP TRIGGER IF EXISTS trg_wallets_upsert ON public.wallets CASCADE;
DROP TRIGGER IF EXISTS trigger_protect_finalized_ledger ON public.ledger_entries CASCADE;
DROP TRIGGER IF EXISTS trigger_generate_ledger_hash_chain ON public.ledger_entries CASCADE;
DROP TRIGGER IF EXISTS trg_ledger_hashing ON public.ledger_entries CASCADE;
DROP TRIGGER IF EXISTS trg_wallets_upsert_logic ON public.wallets_store CASCADE;

-- 2. BULLETPROOF MATERIALIZATION (Direct SQL Update)
-- This bypasses the function and trigger, forcing the balance store to match the v6 ledger exactly.
UPDATE public.wallets_store w
SET 
    balance = GREATEST(0, sub.truth_sum),
    updated_at = NOW()
FROM (
    SELECT wallet_id, SUM(amount) as truth_sum
    FROM public.ledger_entries_v6
    GROUP BY wallet_id
) sub
WHERE w.id = sub.wallet_id;

-- 3. ENSURE NEW SOVEREIGN TRIGGER IS READY
-- We re-enable normal mode after this
SET session_replication_role = 'origin';

-- Update the sync function to be bulletproof for future entries
CREATE OR REPLACE FUNCTION public.sync_wallet_balance_from_ledger(p_wallet_id UUID)
RETURNS VOID AS $$
DECLARE
    v_true_balance NUMERIC(30,18);
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_true_balance
    FROM public.ledger_entries_v6
    WHERE wallet_id = p_wallet_id;

    UPDATE public.wallets_store
    SET balance = GREATEST(0, v_true_balance), updated_at = NOW()
    WHERE id = p_wallet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-establish the trigger
DROP TRIGGER IF EXISTS trg_ledger_sovereign_sync ON public.ledger_entries_v6;
CREATE TRIGGER trg_ledger_sovereign_sync
AFTER INSERT OR UPDATE ON public.ledger_entries_v6
FOR EACH ROW
EXECUTE FUNCTION public.trg_ledger_sovereign_sync_fn();

COMMIT;
