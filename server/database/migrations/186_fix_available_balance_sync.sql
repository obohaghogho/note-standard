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
        v_true_balance NUMERIC(30,18);
    BEGIN
        -- Calculate total balance from settled/reconciled entries
        SELECT COALESCE(SUM(l.amount), 0) INTO v_true_balance
        FROM public.ledger_entries_v6 l
        JOIN public.ledger_transactions_v6 t ON t.id = l.transaction_id
        WHERE l.wallet_id = p_wallet_id 
        AND (
            (l.amount > 0 AND t.status IN ('SETTLED', 'RECONCILED')) 
            OR 
            (l.amount < 0 AND t.status IN ('SETTLED', 'RECONCILED', 'RESERVED', 'APPROVED', 'PROCESSING', 'SENT', 'CONFIRMING'))
        );

        -- Update both balance and available_balance to keep UI in sync
        UPDATE public.wallets_store
        SET balance = GREATEST(0, v_true_balance),
            available_balance = GREATEST(0, v_true_balance),
            updated_at = NOW()
        WHERE id = p_wallet_id;
    END;
    $function$;

COMMIT;
