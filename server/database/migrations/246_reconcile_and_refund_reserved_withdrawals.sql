-- =============================================================================
-- Migration 246: Reconcile and Refund Orphaned Reserved Withdrawals
-- =============================================================================
-- Automatically reverses all stuck/orphaned RESERVED payout requests that did not 
-- settle with Fincra, restoring the reserved funds (e.g. 250 NGN) to the user's 
-- active wallet balance in public.wallets_store.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_rec RECORD;
    v_result JSONB;
BEGIN
    FOR v_rec IN 
        SELECT reference, user_id, gross_amount, currency
        FROM public.fincra_transactions
        WHERE type = 'WITHDRAWAL'
          AND status IN ('RESERVED', 'PENDING', 'MANUAL_REVIEW', 'OTP_REQUIRED')
          AND (fincra_reference IS NULL OR fincra_reference = '')
    LOOP
        v_result := public.finalize_enterprise_withdrawal(
            v_rec.reference,
            NULL,
            'REVERSED',
            'SYSTEM_RECOVERY',
            'Orphaned reserved payout auto-refunded to wallet balance'
        );
        RAISE NOTICE 'Refunded transaction % for user %: %', v_rec.reference, v_rec.user_id, v_result;
    END LOOP;
END $$;

-- Synchronize available_balance with balance for any desynced wallet entries
UPDATE public.wallets_store
SET available_balance = GREATEST(balance, available_balance),
    updated_at = NOW()
WHERE available_balance < balance;

COMMIT;
