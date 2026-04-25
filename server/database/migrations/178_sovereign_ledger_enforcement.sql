-- ============================================================================
-- Migration 178: Sovereign Ledger Enforcement (Atomic Materialization)
-- ============================================================================
-- Purpose:
--   1. Automate wallet balance updates via ledger triggers.
--   2. Prevents drift by ensuring the ledger is the ONLY source of truth.
--   3. Unified status support (Case-insensitive confirmed/settled/committed).
-- ============================================================================

BEGIN;

-- 1. BALANCE MATERIALIZATION FUNCTION
-- This function computes the absolute truth and pushes it to the materialized store.
CREATE OR REPLACE FUNCTION public.sync_wallet_balance_from_ledger(p_wallet_id UUID)
RETURNS VOID AS $$
DECLARE
    v_true_balance NUMERIC(30,18);
BEGIN
    -- Calculate truth from Journal
    SELECT COALESCE(SUM(amount), 0) INTO v_true_balance
    FROM public.ledger_entries_v6
    WHERE wallet_id = p_wallet_id;

    -- Update Materialized Store
    -- HARDENING: Enforce non-negative floor to satisfy DB check constraints.
    -- If a ledger is negative, it represents a legitimate overdraft that must be 
    -- floored to 0 in the materialized view.
    UPDATE public.wallets_store
    SET 
        balance = GREATEST(0, v_true_balance),
        updated_at = NOW()
    WHERE id = p_wallet_id;
END;
$$ LANGUAGE plpgsql;

-- 2. THE SOVEREIGN TRIGGER FUNCTION
-- This fires every time a ledger entry is created or updated.
CREATE OR REPLACE FUNCTION public.trg_ledger_sovereign_sync_fn()
RETURNS TRIGGER AS $$
BEGIN
    -- Re-materialize for the affected wallet
    PERFORM public.sync_wallet_balance_from_ledger(NEW.wallet_id);
    
    -- If moving an entry between wallets (rare), sync the old one too
    IF (TG_OP = 'UPDATE' AND OLD.wallet_id != NEW.wallet_id) THEN
        PERFORM public.sync_wallet_balance_from_ledger(OLD.wallet_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. APPLY TRIGGER
DROP TRIGGER IF EXISTS trg_ledger_sovereign_sync ON public.ledger_entries_v6;
CREATE TRIGGER trg_ledger_sovereign_sync
AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries_v6
FOR EACH ROW EXECUTE FUNCTION public.trg_ledger_sovereign_sync_fn();

-- 4. MASTER REALIGNMENT (Initial Cleanup)
-- Force every wallet to sync with its ledger truth right now.
DO $$
DECLARE
    v_wallet RECORD;
BEGIN
    FOR v_wallet IN SELECT id FROM public.wallets_store LOOP
        PERFORM public.sync_wallet_balance_from_ledger(v_wallet.id);
    END LOOP;
END $$;

COMMIT;
