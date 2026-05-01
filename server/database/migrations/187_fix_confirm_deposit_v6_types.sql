-- ============================================================================
-- Migration 187: Fix confirm_deposit v6 Type Mismatches
-- ============================================================================
-- Purpose:
--   1. Ensure idempotency_key is always a valid UUID for the v6 ledger.
--   2. Fix the "null value" or "invalid syntax" error when transactions
--      don't have an explicit idempotency_key set.
--   3. Standardize terminal states to satisfy v6 enum constraints.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.confirm_deposit(UUID, UUID, NUMERIC, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.confirm_deposit(UUID, UUID, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id      UUID,
    p_amount         NUMERIC,
    p_external_hash  TEXT DEFAULT NULL,
    p_override       BOOLEAN DEFAULT FALSE,
    p_override_reason TEXT DEFAULT 'late_provider_success'
) RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_currency VARCHAR;
    v_status VARCHAR;
    v_metadata JSONB;
    v_idempotency_key UUID; -- FIXED: Explicitly use UUID type
    v_v6_tx_id UUID;
    v_entries JSONB;
BEGIN
    -- 1. ATOMIC LOCK & DATA FETCH
    -- We use a deterministic UUID for the v6 ledger.
    -- If the transaction has a valid UUID idempotency_key, we use it.
    -- Otherwise, we generate one from the reference or id.
    SELECT 
        user_id, 
        currency, 
        status, 
        metadata,
        CASE 
            WHEN idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
            THEN idempotency_key::UUID 
            ELSE md5(COALESCE(idempotency_key, p_transaction_id::text))::UUID 
        END
    INTO v_user_id, v_currency, v_status, v_metadata, v_idempotency_key
    FROM public.transactions 
    WHERE id = p_transaction_id 
    FOR UPDATE;

    -- 2. FINALIZED GUARD
    IF v_status IN ('COMPLETED', 'CANCELLED') AND NOT p_override THEN
        RETURN;
    END IF;

    -- 3. ELIGIBILITY GUARD
    -- We allow PENDING, PROCESSING, and FAILED (for retry/override)
    IF v_status NOT IN ('PENDING', 'PROCESSING', 'FAILED') THEN
        RETURN;
    END IF;

    -- 4. V6 LEDGER INTEGRATION (The Source of Truth)
    -- Check if this specific intent has already been materialized in v6
    -- Cast to text because idempotency_key column might be TEXT in some environments
    SELECT id INTO v_v6_tx_id FROM public.ledger_transactions_v6 WHERE idempotency_key::text = v_idempotency_key::text;

    IF v_v6_tx_id IS NULL THEN
        -- Construct Entries for Sovereign Commit
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

        -- Atomic Ledger Commit (V6)
        PERFORM public.execute_ledger_transaction_v6(
            v_idempotency_key::text, -- Cast to text for the function signature but guaranteed UUID format
            'DEPOSIT',
            'SETTLED',
            v_metadata || jsonb_build_object(
                'external_hash', p_external_hash,
                'override_applied', p_override,
                'override_reason', CASE WHEN p_override THEN p_override_reason ELSE NULL END
            ),
            v_entries
        );
    END IF;

    -- 5. MATERIALIZATION LAYER: Update legacy Transactions table
    UPDATE public.transactions 
    SET status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        completed_at = NOW(),
        updated_at = NOW(),
        metadata = v_metadata || jsonb_build_object(
            'journaled', true, 
            'v6_sync', NOW(),
            'settlement_status', 'SETTLED'
        )
    WHERE id = p_transaction_id;

    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
