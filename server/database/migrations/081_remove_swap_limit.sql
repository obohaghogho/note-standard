-- ============================================================================
-- Migration 081: FIX SWAP SLIPPAGE RPC REMOVING AGNOSTIC MAX SWAP CHECK
-- ============================================================================
-- Purpose:
--   The previous execute_swap_from_quote RPC included a static Check 
--   against a max amount of 5000 irrespective of the token.
--   This blocked legitimate swaps of high nominal value (e.g. 100,000 NGN).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.execute_swap_from_quote(
    p_quote_id UUID,
    p_current_market_rate NUMERIC, -- NEW: Pass the live price at exact moment of execution
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_quote      RECORD;
    v_tx_id      UUID;
    v_txn_ref    TEXT;
    v_wallet_1   UUID;
    v_wallet_2   UUID;
    v_price_diff NUMERIC;
    v_slippage_pct NUMERIC;
BEGIN
    -- STEP 1: Lock and validate the quote
    SELECT * INTO v_quote 
    FROM public.swap_quotes 
    WHERE id = p_quote_id 
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND'; END IF;
    IF v_quote.status != 'PENDING' THEN RAISE EXCEPTION 'QUOTE_ALREADY_USED_OR_EXPIRED'; END IF;
    IF v_quote.expires_at < NOW() THEN 
        UPDATE public.swap_quotes SET status = 'EXPIRED' WHERE id = p_quote_id;
        RAISE EXCEPTION 'QUOTE_EXPIRED'; 
    END IF;

    -- STEP 1.2: SLIPPAGE VERIFICATION
    IF p_current_market_rate IS NOT NULL AND p_current_market_rate > 0 THEN
        v_price_diff := abs(v_quote.rate - p_current_market_rate);
        v_slippage_pct := v_price_diff / v_quote.rate;
        
        IF v_slippage_pct > v_quote.slippage_tolerance THEN
            UPDATE public.swap_quotes SET status = 'EXPIRED', metadata = metadata || jsonb_build_object('failure_reason', 'SLIPPAGE_EXCEEDED', 'slippage_pct', v_slippage_pct) WHERE id = p_quote_id;
            RAISE EXCEPTION 'SLIPPAGE_TOLERANCE_EXCEEDED. Price moved by % which is greater than allowed %', ROUND((v_slippage_pct * 100)::numeric, 4), ROUND((v_quote.slippage_tolerance * 100)::numeric, 2);
        END IF;
    END IF;

    -- STEP 2: Atomic Wallet Locking
    IF v_quote.from_wallet_id < v_quote.to_wallet_id THEN
        v_wallet_1 := v_quote.from_wallet_id;
        v_wallet_2 := v_quote.to_wallet_id;
    ELSE
        v_wallet_1 := v_quote.to_wallet_id;
        v_wallet_2 := v_quote.from_wallet_id;
    END IF;

    PERFORM 1 FROM public.wallets_store WHERE id = v_wallet_1 FOR UPDATE;
    PERFORM 1 FROM public.wallets_store WHERE id = v_wallet_2 FOR UPDATE;

    -- STEP 3: Verify Source Balance
    IF (SELECT available_balance FROM public.wallets_store WHERE id = v_quote.from_wallet_id) < (v_quote.from_amount + v_quote.fee) THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS_FOR_SWAP';
    END IF;

    -- STEP 4: Generate Reference
    v_txn_ref := 'TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::text FROM 1 FOR 8));

    -- STEP 5: Deduct From Source (and Fee)
    UPDATE public.wallets_store 
    SET balance = balance - (v_quote.from_amount + v_quote.fee),
        available_balance = available_balance - (v_quote.from_amount + v_quote.fee),
        updated_at = NOW()
    WHERE id = v_quote.from_wallet_id;

    -- STEP 6: Credit To Destination
    UPDATE public.wallets_store 
    SET balance = balance + v_quote.to_amount,
        available_balance = available_balance + v_quote.to_amount,
        updated_at = NOW()
    WHERE id = v_quote.to_wallet_id;

    -- STEP 7: Record in Transactions & Ledger
    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency, 
        amount_from, amount_to, rate, fee, status, 
        idempotency_key, txn_reference, metadata,
        created_at, completed_at
    ) VALUES (
        v_quote.user_id, v_quote.from_wallet_id, 'swap', v_quote.from_currency, v_quote.to_currency, 
        v_quote.from_amount, v_quote.to_amount, v_quote.rate, v_quote.fee, 'COMPLETED', 
        p_idempotency_key, v_txn_ref, v_quote.metadata || jsonb_build_object('quote_id', p_quote_id, 'execution_rate', p_current_market_rate),
        NOW(), NOW()
    ) RETURNING id INTO v_tx_id;

    -- Ledger Entries (Double Entry)
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) 
    VALUES (v_quote.user_id, v_quote.from_wallet_id, v_quote.from_currency, -(v_quote.from_amount + v_quote.fee), 'swap_debit', v_tx_id);

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) 
    VALUES (v_quote.user_id, v_quote.to_wallet_id, v_quote.to_currency, v_quote.to_amount, 'swap_credit', v_tx_id);

    -- STEP 8: Confirm & Finalize Quote
    UPDATE public.swap_quotes SET status = 'EXECUTED', metadata = metadata || jsonb_build_object('tx_id', v_tx_id) WHERE id = p_quote_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
