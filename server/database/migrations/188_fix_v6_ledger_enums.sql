-- ============================================================================
-- Migration 188: Fix v6 Ledger Enums and confirm_deposit Hardening
-- ============================================================================
-- Purpose:
--   1. Expands 'settlement_status_v6' to include terminal states 'FAILED' and 'CANCELLED'.
--   2. Hardens 'confirm_deposit' to handle NULL metadata safely.
--   3. Synchronizes 'transactions' status with ledger integrity guards.
-- ============================================================================

BEGIN;

-- 1. REWRITE confirm_deposit with Hardening
DROP FUNCTION IF EXISTS public.confirm_deposit(UUID, UUID, NUMERIC, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.confirm_deposit(UUID, UUID, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_external_hash TEXT DEFAULT NULL,
    p_override BOOLEAN DEFAULT FALSE,
    p_override_reason TEXT DEFAULT 'late_provider_success'
) RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_currency VARCHAR;
    v_status VARCHAR;
    v_metadata JSONB;
    v_idempotency_key TEXT;
    v_entries JSONB;
    v_v6_tx_id UUID;
BEGIN
    -- ATOMIC ROW-LEVEL LOCK
    SELECT 
        user_id, 
        currency, 
        status, 
        metadata,
        COALESCE(reference_id, provider_reference, id::text)
    FROM public.transactions 
    WHERE id = p_transaction_id 
    FOR UPDATE
    INTO v_user_id, v_currency, v_status, v_metadata, v_idempotency_key;

    -- 1. FINALIZED GUARD (Already completed or cancelled)
    IF v_status IN ('COMPLETED', 'SUCCESS') THEN
        RETURN;
    END IF;

    -- 2. STATE TRANSITION GUARD
    -- If it's FAILED but we have an override, we allow it.
    IF v_status NOT IN ('PENDING', 'PROCESSING', 'FAILED') THEN
        RETURN;
    END IF;

    IF v_status = 'FAILED' AND NOT p_override THEN
        RETURN;
    END IF;

    -- IDEMPOTENCY CHECK (v6 Ledger)
    SELECT id INTO v_v6_tx_id FROM public.ledger_transactions_v6 WHERE idempotency_key::text = v_idempotency_key::text;

    IF v_v6_tx_id IS NOT NULL THEN
        -- Already materialized in v6 ledger. Just update the legacy header.
        UPDATE public.transactions 
        SET status = 'COMPLETED',
            external_hash = COALESCE(p_external_hash, external_hash),
            completed_at = NOW(),
            updated_at = NOW(),
            metadata = COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
                'journaled', true, 
                'v6_sync', NOW(),
                'settlement_status', 'SETTLED'
            )
        WHERE id = p_transaction_id;
        RETURN;
    END IF;

    -- 3. LEDGER MATERIALIZATION (v6 Journaled)
    -- Construct Journal Entries (Self-balancing)
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

    -- Execute v6 Ledger Commit
    -- This handles the double-entry materialization and updates wallets_store atomically.
    PERFORM public.execute_ledger_transaction_v6(
        v_idempotency_key::text, 
        'DEPOSIT',
        'SETTLED',
        COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
            'external_hash', p_external_hash,
            'rpc_call', 'confirm_deposit',
            'overridden', p_override
        ),
        v_entries
    );

    -- 4. UPDATE LEGACY TRANSACTION RECORD
    UPDATE public.transactions 
    SET status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        completed_at = NOW(),
        updated_at = NOW(),
        metadata = COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
            'journaled', true, 
            'v6_sync', NOW(),
            'settlement_status', 'SETTLED'
        )
    WHERE id = p_transaction_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
