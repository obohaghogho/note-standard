-- ============================================================================
-- Migration 186: Fix Available Balance Sync
-- ============================================================================
-- Purpose:
--   Updates the sync_wallet_balance_from_ledger RPC to also synchronize
--   the available_balance column. This ensures that the UI (which reads
--   available_balance) reflects the actual state of the ledger.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_wallet_balance_from_ledger(p_wallet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
        v_total_balance NUMERIC(30,18);
        v_available_balance NUMERIC(30,18);
    BEGIN
        -- 1. Total Balance: Everything that is not failed or cancelled
        -- (Includes pending deposits and pending withdrawals)
        SELECT COALESCE(SUM(l.amount), 0) INTO v_total_balance
        FROM public.ledger_entries_v6 l
        JOIN public.ledger_transactions_v6 t ON t.id = l.transaction_id
        WHERE l.wallet_id = p_wallet_id 
        AND t.status NOT IN ('FAILED', 'CANCELLED', 'REJECTED');

        -- 2. Available Balance: Settled credits + ALL non-failed debits
        -- (Excludes pending deposits, but SUBTRACTS pending withdrawals)
        SELECT COALESCE(SUM(l.amount), 0) INTO v_available_balance
        FROM public.ledger_entries_v6 l
        JOIN public.ledger_transactions_v6 t ON t.id = l.transaction_id
        WHERE l.wallet_id = p_wallet_id 
        AND (
            (l.amount > 0 AND t.status IN ('SETTLED', 'RECONCILED')) 
            OR 
            (l.amount < 0 AND t.status NOT IN ('FAILED', 'CANCELLED', 'REJECTED'))
        );

        -- Update Materialized Store
        UPDATE public.wallets_store
        SET balance = GREATEST(0, v_total_balance),
            available_balance = GREATEST(0, v_available_balance),
            updated_at = NOW()
        WHERE id = p_wallet_id;
    END;
    $function$;

COMMIT;
