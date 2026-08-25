-- Migration 415: confirm_deposit_v7 — Returns BOOLEAN for deterministic caller feedback
--
-- The legacy confirm_deposit returns VOID, so callers cannot tell if a credit
-- was applied or silently skipped (state guard / idempotency hit).  This new
-- version preserves identical logic but RETURNS BOOLEAN:
--   TRUE  → wallet was actually credited in this call
--   FALSE → credit was already applied or the state guard blocked it
--
-- The DepositCreditEngine calls confirm_deposit_v7 preferentially and falls
-- back to confirm_deposit when this function does not yet exist.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_deposit_v7(
    p_transaction_id UUID,
    p_wallet_id      UUID,
    p_amount         NUMERIC,
    p_external_hash  TEXT    DEFAULT NULL,
    p_source         TEXT    DEFAULT 'SYSTEM'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user_id         UUID;
    v_currency        VARCHAR;
    v_status          VARCHAR;
    v_metadata        JSONB;
    v_idempotency_key TEXT;
    v_provider        VARCHAR;
    v_sys_address     TEXT;
    v_sys_wallet_id   UUID;
    v_entries         JSONB;
    v_v6_tx_id        UUID;
BEGIN
    -- ══════════════════════════════════════════════════════════════════════
    -- 1. ATOMIC ROW-LEVEL LOCK  (prevents concurrent credit for same tx)
    -- ══════════════════════════════════════════════════════════════════════
    SELECT
        user_id,
        currency,
        status,
        metadata,
        COALESCE(reference_id, provider_reference, id::text),
        provider
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE                -- ← key difference from in-memory locks
    INTO v_user_id, v_currency, v_status, v_metadata, v_idempotency_key, v_provider;

    IF v_user_id IS NULL THEN
        -- Transaction not found — caller should handle TRANSACTION_NOT_FOUND
        RETURN FALSE;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 2. FINALIZED GUARD — already completed means idempotency hit
    -- ══════════════════════════════════════════════════════════════════════
    IF v_status IN ('COMPLETED', 'SUCCESS') THEN
        RETURN FALSE;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 3. STATE TRANSITION GUARD — only PENDING/PROCESSING/FAILED allowed
    -- ══════════════════════════════════════════════════════════════════════
    IF v_status NOT IN ('PENDING', 'PROCESSING', 'FAILED') THEN
        RETURN FALSE;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 4. IDEMPOTENCY CHECK (v6 Ledger)
    -- ══════════════════════════════════════════════════════════════════════
    SELECT id INTO v_v6_tx_id
    FROM public.ledger_transactions_v6
    WHERE idempotency_key::text = v_idempotency_key::text;

    IF v_v6_tx_id IS NOT NULL THEN
        -- Ledger already has this entry. Just sync the transaction status.
        UPDATE public.transactions
        SET status       = 'COMPLETED',
            external_hash = COALESCE(p_external_hash, external_hash),
            completed_at  = NOW(),
            updated_at    = NOW(),
            metadata      = COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
                'journaled', true,
                'v6_sync', NOW(),
                'settlement_status', 'SETTLED',
                'credit_source', p_source
            )
        WHERE id = p_transaction_id;
        -- Return FALSE because we did NOT apply a new credit — it was already there
        RETURN FALSE;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 5. RESOLVE PROVIDER SETTLEMENT LEDGER ADDRESS
    -- ══════════════════════════════════════════════════════════════════════
    v_sys_address := 'SETTLEMENT_' || UPPER(COALESCE(v_provider, 'PAYSTACK')) || '_' || v_currency;
    SELECT id INTO v_sys_wallet_id FROM public.wallets_store WHERE address = v_sys_address LIMIT 1;

    IF v_sys_wallet_id IS NULL THEN
        v_sys_address := 'SETTLEMENT_PAYSTACK_' || v_currency;
        SELECT id INTO v_sys_wallet_id FROM public.wallets_store WHERE address = v_sys_address LIMIT 1;

        IF v_sys_wallet_id IS NULL THEN
            INSERT INTO public.wallets_store (user_id, currency, address, provider, network)
            VALUES ('00000000-0000-0000-0000-000000000000'::UUID, v_currency, v_sys_address, 'internal', 'INTERNAL')
            RETURNING id INTO v_sys_wallet_id;
        END IF;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 6. LEDGER MATERIALIZATION (v6 Journaled) — actual balance mutation
    -- ══════════════════════════════════════════════════════════════════════
    v_entries := jsonb_build_array(
        jsonb_build_object(
            'wallet_id', p_wallet_id,
            'user_id',   v_user_id,
            'currency',  v_currency,
            'amount',    p_amount,
            'side',      'CREDIT'
        ),
        jsonb_build_object(
            'wallet_id', v_sys_wallet_id,
            'user_id',   '00000000-0000-0000-0000-000000000000'::UUID,
            'currency',  v_currency,
            'amount',    -p_amount,
            'side',      'DEBIT'
        )
    );

    PERFORM public.execute_ledger_transaction_v6(
        v_idempotency_key::text,
        'DEPOSIT',
        'SETTLED',
        COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
            'external_hash',    p_external_hash,
            'rpc_call',         'confirm_deposit_v7',
            'credit_source',    p_source,
            'settlement_ledger', v_sys_address
        ),
        v_entries
    );

    -- ══════════════════════════════════════════════════════════════════════
    -- 7. UPDATE TRANSACTION STATUS (atomic within same DB transaction)
    -- ══════════════════════════════════════════════════════════════════════
    UPDATE public.transactions
    SET status       = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        completed_at  = NOW(),
        updated_at    = NOW(),
        metadata      = COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
            'journaled', true,
            'v6_sync', NOW(),
            'settlement_status', 'SETTLED',
            'credit_source', p_source,
            'credit_engine', 'DepositCreditEngine_v1'
        )
    WHERE id = p_transaction_id;

    -- ══════════════════════════════════════════════════════════════════════
    -- 8. RETURN TRUE — credit was ACTUALLY applied in this call
    -- ══════════════════════════════════════════════════════════════════════
    RETURN TRUE;

END;
$function$;

-- Grant execution to the service role used by Supabase client
GRANT EXECUTE ON FUNCTION public.confirm_deposit_v7(UUID, UUID, NUMERIC, TEXT, TEXT) TO service_role;

COMMIT;
