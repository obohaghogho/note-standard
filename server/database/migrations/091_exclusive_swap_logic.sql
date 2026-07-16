-- Migration 091: Inclusive Swap Logic RPC Refactor
--
-- UPDATES:
--   Refactors `initiate_external_swap_intent` to handle GROSS amount directly 
--   (Inclusive Model). The total debit is the gross amount. The net swap amount 
--   is calculated securely by subtracting the requested fee.

DROP FUNCTION IF EXISTS public.initiate_external_swap_intent(UUID, UUID, NUMERIC, NUMERIC, UUID, VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.initiate_external_swap_intent(
    p_from_wallet_id UUID,
    p_to_wallet_id UUID,
    p_gross_amount NUMERIC,     -- The total amount entered by the user
    p_fee_amount NUMERIC,       -- The inclusive fee (e.g., 7.5% of gross)
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
    v_net_swap_amount NUMERIC;
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
    FROM wallets_store
    WHERE id = p_from_wallet_id
    FOR UPDATE;

    -- In the inclusive model, the user must have at least the GROSS amount
    IF v_available_balance < p_gross_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS (Available: %, Required: %)', v_available_balance, p_gross_amount;
    END IF;

    -- The actual amount being sent to the provider
    v_net_swap_amount := p_gross_amount - p_fee_amount;

    -- 3. Fetch target currency
    SELECT currency INTO v_to_currency
    FROM wallets_store
    WHERE id = p_to_wallet_id;

    -- 4. Deduct GROSS amount IMMEDIATELY
    UPDATE wallets_store
    SET balance = balance - p_gross_amount,
        available_balance = available_balance - p_gross_amount,
        updated_at = NOW()
    WHERE id = p_from_wallet_id;

    -- 5. Create PENDING transaction record
    INSERT INTO transactions (
        user_id,
        wallet_id,
        amount,            -- Gross amount
        currency,
        amount_from,       -- Gross amount
        amount_to,         -- Expected output
        from_currency,
        to_currency,
        fee,               -- Inclusive fee portion
        type,
        status,
        reference_id,
        provider,
        external_payout_id,
        metadata
    ) VALUES (
        v_user_id,
        p_from_wallet_id,
        p_gross_amount,
        v_from_currency,
        p_gross_amount,
        v_quote.to_amount,
        v_from_currency,
        v_to_currency,
        p_fee_amount,
        'SWAP_INTENT',
        'PENDING',
        p_reference,
        p_provider,
        p_external_conversion_id,
        jsonb_build_object(
            'quote_id', p_quote_id,
            'expected_to_amount', v_quote.to_amount,
            'fee_deducted', p_fee_amount,
            'net_converted', v_net_swap_amount,
            'total_debit', p_gross_amount,
            'swap_rate_locked', v_quote.rate,
            'target_wallet_id', p_to_wallet_id,
            'fee_model', 'inclusive'
        )
    )
    RETURNING id INTO v_tx_id;

    -- 6. Record the deduction in the ledger (Full Gross Debit)
    INSERT INTO ledger_entries (
        user_id,
        wallet_id,
        type,
        amount,
        currency,
        reference,
        status
    ) VALUES (
        v_user_id,
        p_from_wallet_id,
        'swap_debit',
        -p_gross_amount,
        v_from_currency,
        v_tx_id,
        'confirmed'
    );

    -- 7. Mark quote as Processing
    UPDATE swap_quotes
    SET status = 'PROCESSING', updated_at = NOW()
    WHERE id = p_quote_id;

    RETURN v_tx_id;
END;
$$;
