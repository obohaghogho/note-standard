-- ============================================================================
-- Migration 185: Fix confirm_deposit Idempotency Key
-- ============================================================================
-- Purpose:
--   Legacy transactions or webhooks might reach confirm_deposit without an
--   idempotency_key set on the transactions table. The v6 Ledger strictly
--   requires an idempotency_key to prevent double-spending.
--   This adds a fallback to the transaction ID to ensure it never fails with
--   a null constraint violation.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS confirm_deposit(UUID, UUID, NUMERIC, TEXT, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_external_hash TEXT DEFAULT NULL,
    p_override BOOLEAN DEFAULT FALSE,
    p_override_reason TEXT DEFAULT 'late_provider_success'
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_currency VARCHAR;
    v_status VARCHAR;
    v_metadata JSONB;
    v_idempotency_key TEXT;
    v_v6_tx_id UUID;
    v_entries JSONB;
    v_applied BOOLEAN := FALSE;
BEGIN
    -- ATOMIC LOCK & DATA FETCH
    -- Fallback to 'tx_' || id if idempotency_key is null
    SELECT user_id, currency, status, metadata, COALESCE(idempotency_key, 'tx_' || id::text)
    INTO v_user_id, v_currency, v_status, v_metadata, v_idempotency_key
    FROM transactions 
    WHERE id = p_transaction_id 
    FOR UPDATE;

    -- FINALIZED GUARD
    IF v_status IN ('COMPLETED', 'CANCELLED') AND NOT p_override THEN
        RETURN FALSE;
    END IF;

    -- PENDING/PROCESSING/OVERRIDE GUARD
    IF v_status NOT IN ('PENDING', 'PROCESSING', 'FAILED') THEN
        RETURN FALSE;
    END IF;

    -- Purity Check: Only proceed with ledger insert if not already committed in v6
    SELECT id INTO v_v6_tx_id FROM public.ledger_transactions_v6 WHERE idempotency_key = v_idempotency_key;

    IF v_v6_tx_id IS NULL THEN
        -- Construct Entries for Sovereign Commit
        -- We use SYSTEM_LP_USD as the counterparty for deposits (LP = Liquidity Provider)
        v_entries := jsonb_build_array(
            jsonb_build_object(
                'wallet_id', p_wallet_id,
                'user_id', v_user_id,
                'currency', v_currency,
                'amount', p_amount,
                'side', 'CREDIT'
            ),
            jsonb_build_object(
                'wallet_id', (SELECT id FROM wallets_store WHERE address = 'SYSTEM_LP_' || v_currency LIMIT 1),
                'user_id', (SELECT user_id FROM wallets_store WHERE address = 'SYSTEM_LP_' || v_currency LIMIT 1),
                'currency', v_currency,
                'amount', -p_amount,
                'side', 'DEBIT'
            )
        );

        -- Atomic Ledger Commit
        PERFORM public.execute_ledger_transaction_v6(
            v_idempotency_key,
            'DEPOSIT',
            'SETTLED',
            v_metadata || jsonb_build_object('external_hash', p_external_hash),
            v_entries
        );
        v_applied := TRUE;
    END IF;

    -- Mark legacy Transactions table as COMPLETED
    UPDATE transactions 
    SET status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        updated_at = NOW(),
        metadata = v_metadata || jsonb_build_object('journaled', true, 'v6_sync', NOW())
    WHERE id = p_transaction_id;

    RETURN v_applied;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
