-- Migration 087: External Swap Intent RPC
--
-- BACKGROUND:
--   To comply with the non-custodial License-Light facilitator model, swaps 
--   are no longer executed entirely on the internal ledger. Instead, we call 
--   NOWPayments to perform the conversion externally.
--   
--   This RPC replaces `execute_swap_from_quote`. It deducts the user's source
--   funds immediately (to prevent double spending) but marks the transaction 
--   as PENDING and records the provider's external conversion ID. The target 
--   funds are ONLY credited when the external webhook confirms the conversion.

CREATE OR REPLACE FUNCTION public.initiate_external_swap_intent(
    p_from_wallet_id UUID,
    p_to_wallet_id UUID,
    p_amount NUMERIC,
    p_quote_id UUID,
    p_reference VARCHAR,
    p_external_conversion_id VARCHAR,
    p_provider VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_from_currency TEXT;
    v_to_currency TEXT;
    v_available_balance NUMERIC;
    v_tx_id UUID;
    v_quote RECORD;
BEGIN
    -- 1. Fetch quote details
    SELECT * INTO v_quote
    FROM swap_quotes
    WHERE id = p_quote_id AND status = 'PENDING';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found or already processed';
    END IF;

    -- 2. Validate source wallet and lock record
    SELECT user_id, currency, balance INTO v_user_id, v_from_currency, v_available_balance
    FROM wallets
    WHERE id = p_from_wallet_id
    FOR UPDATE;

    IF v_available_balance < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
    END IF;

    -- 3. Fetch target currency
    SELECT currency INTO v_to_currency
    FROM wallets
    WHERE id = p_to_wallet_id;

    -- 4. Deduct from source wallet IMMEDIATELY (freeze funds)
    UPDATE wallets
    SET balance = balance - p_amount
    WHERE id = p_from_wallet_id;

    -- 5. Create PENDING transaction record tracking the external conversion
    INSERT INTO transactions (
        user_id,
        wallet_id,
        amount,
        currency,
        amount_from,
        amount_to,
        from_currency,
        to_currency,
        type,
        status,
        reference_id,
        provider,
        external_payout_id, -- Reusing this column for the conversion reference
        metadata
    ) VALUES (
        v_user_id,
        p_from_wallet_id, -- Link to source wallet
        p_amount,
        v_from_currency,
        p_amount,
        v_quote.to_amount,
        v_from_currency,
        v_to_currency,
        'SWAP_INTENT',
        'PENDING',
        p_reference,
        p_provider,
        p_external_conversion_id,
        jsonb_build_object(
            'quote_id', p_quote_id,
            'expected_to_amount', v_quote.to_amount,
            'fee_deducted', v_quote.fee,
            'swap_rate_locked', v_quote.rate,
            'target_wallet_id', p_to_wallet_id
        )
    )
    RETURNING id INTO v_tx_id;

    -- 6. Record the deduction in the ledger
    INSERT INTO ledger_entries (
        transaction_id,
        wallet_id,
        entry_type,
        amount,
        currency,
        balance_after
    ) VALUES (
        v_tx_id,
        p_from_wallet_id,
        'DEBIT',
        p_amount,
        v_from_currency,
        v_available_balance - p_amount
    );

    -- 7. Mark quote as Processing (waiting on webhook)
    UPDATE swap_quotes
    SET status = 'PROCESSING', updated_at = NOW()
    WHERE id = p_quote_id;

    RETURN v_tx_id;
END;
$$;
