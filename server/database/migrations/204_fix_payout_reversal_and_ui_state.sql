-- Migration 204: Fix Payout Reversal and UI State
-- This migration provides a mechanism to safely reverse failed payouts, 
-- ensuring that the user's ledger and wallet balance are correctly refunded 
-- when a payout fails (e.g. Treasury limits or Provider rejection).

BEGIN;

CREATE OR REPLACE FUNCTION public.reverse_failed_payout_v6(p_payout_id UUID)
RETURNS VOID AS $$
DECLARE
    v_payout_req RECORD;
    v_tx_id UUID;
    v_reversal_tx_id UUID;
    v_entry RECORD;
    v_status settlement_status_v6;
BEGIN
    -- 1. Look up the payout request
    SELECT * INTO v_payout_req FROM public.payout_requests WHERE id = p_payout_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'REVERSAL_FAILED: Payout request % not found', p_payout_id;
    END IF;

    -- 2. Find the associated ledger transaction
    SELECT id, status INTO v_tx_id, v_status 
    FROM public.ledger_transactions_v6 
    WHERE idempotency_key = v_payout_req.idempotency_key::text;

    IF v_tx_id IS NULL THEN
        -- It's possible the ledger transaction hasn't been committed yet or uses a different key mapping.
        -- Let's try matching via transaction_id column in payout_requests
        SELECT id, status INTO v_tx_id, v_status
        FROM public.ledger_transactions_v6
        WHERE id = v_payout_req.transaction_id;
        
        IF v_tx_id IS NULL THEN
            RAISE NOTICE 'REVERSAL_SKIPPED: Ledger transaction for payout % not found. Nothing to reverse.', p_payout_id;
            RETURN;
        END IF;
    END IF;

    -- 3. Check if already reversed
    IF v_status = 'REVERSED' THEN
        RAISE NOTICE 'REVERSAL_SKIPPED: Payout % is already reversed.', p_payout_id;
        RETURN;
    END IF;

    -- 4. Mark original as reversed
    UPDATE public.ledger_transactions_v6
    SET status = 'REVERSED', reversed_at = NOW()
    WHERE id = v_tx_id;

    -- 5. Create the reversal transaction header
    INSERT INTO public.ledger_transactions_v6 (idempotency_key, type, status, metadata)
    VALUES (
        'reversal_' || p_payout_id::text, 
        'REVERSAL', 
        'SETTLED', 
        jsonb_build_object('original_payout_id', p_payout_id, 'reason', 'Failed Payout Reversal')
    )
    RETURNING id INTO v_reversal_tx_id;

    -- 6. Insert inverse ledger entries
    FOR v_entry IN SELECT * FROM public.ledger_entries_v6 WHERE transaction_id = v_tx_id
    LOOP
        INSERT INTO public.ledger_entries_v6 (transaction_id, wallet_id, user_id, currency, amount, side)
        VALUES (
            v_reversal_tx_id, 
            v_entry.wallet_id, 
            v_entry.user_id, 
            v_entry.currency, 
            -v_entry.amount, -- Invert amount
            CASE WHEN v_entry.side = 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END -- Invert side
        );
    END LOOP;

    RAISE NOTICE 'REVERSAL_SUCCESS: Payout % reversed successfully via tx %', p_payout_id, v_reversal_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
