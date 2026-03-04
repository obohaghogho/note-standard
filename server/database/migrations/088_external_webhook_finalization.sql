-- Migration 088: External Payout and Conversion Webhook Handlers
--
-- BACKGROUND:
--   Now that Withdrawals and Swaps delegate the actual money movement 
--   to external providers (Flutterwave/NOWPayments), we need secure RPCs 
--   to finalize the ledger when the provider's IPN webhook fires confirming
--   success or failure.

-- 1. Webhook Finalization for Withdrawals 
CREATE OR REPLACE FUNCTION public.finalize_external_withdrawal(
    p_external_payout_id VARCHAR,
    p_status VARCHAR,
    p_provider_hash VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tx_id UUID;
    v_current_status VARCHAR;
    v_wallet_id UUID;
    v_amount NUMERIC;
    v_currency TEXT;
    v_user_id UUID;
BEGIN
    SELECT id, status, wallet_id, amount, currency, user_id
    INTO v_tx_id, v_current_status, v_wallet_id, v_amount, v_currency, v_user_id
    FROM transactions 
    WHERE external_payout_id = p_external_payout_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction with payout ID % not found', p_external_payout_id;
    END IF;

    IF v_current_status IN ('COMPLETED', 'FAILED') THEN
        RETURN FALSE; -- Already processed
    END IF;

    IF p_status = 'SUCCESS' THEN
        -- The internal balance was already deducted during the POST /withdraw intent.
        -- We just need to mark it complete.
        UPDATE transactions 
        SET status = 'COMPLETED',
            external_hash = p_provider_hash,
            external_payout_status = p_status,
            updated_at = NOW()
        WHERE id = v_tx_id;

    ELSIF p_status = 'FAILED' THEN
        -- The withdrawal failed at the provider. We must REFUND the user's ledger.
        UPDATE transactions 
        SET status = 'FAILED',
            external_payout_status = p_status,
            updated_at = NOW()
        WHERE id = v_tx_id;

        UPDATE wallets
        SET balance = balance + v_amount
        WHERE id = v_wallet_id;

        -- Record the refund in the ledger
        INSERT INTO ledger_entries (
            transaction_id, wallet_id, entry_type, amount, currency, balance_after
        ) VALUES (
            v_tx_id, v_wallet_id, 'CREDIT_REFUND', v_amount, v_currency, 
            (SELECT balance FROM wallets WHERE id = v_wallet_id)
        );
    END IF;

    RETURN TRUE;
END;
$$;


-- 2. Webhook Finalization for Swaps
CREATE OR REPLACE FUNCTION public.finalize_external_conversion(
    p_external_conversion_id VARCHAR,
    p_status VARCHAR,
    p_provider_hash VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tx_id UUID;
    v_current_status VARCHAR;
    v_from_wallet_id UUID;
    v_to_wallet_id UUID;
    v_to_amount NUMERIC;
    v_to_currency TEXT;
    v_from_amount NUMERIC;
    v_quote_id UUID;
    v_meta JSONB;
BEGIN
    SELECT id, status, wallet_id, metadata, amount, amount_to, to_currency
    INTO v_tx_id, v_current_status, v_from_wallet_id, v_meta, v_from_amount, v_to_amount, v_to_currency
    FROM transactions 
    WHERE external_payout_id = p_external_conversion_id
      AND type = 'SWAP_INTENT'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Swap intent with conversion ID % not found', p_external_conversion_id;
    END IF;

    IF v_current_status IN ('COMPLETED', 'FAILED') THEN
        RETURN FALSE;
    END IF;

    v_to_wallet_id := (v_meta->>'target_wallet_id')::UUID;
    v_quote_id := (v_meta->>'quote_id')::UUID;

    IF p_status = 'SUCCESS' THEN
        -- The provider converted the funds successfully. 
        -- The source was already deducted. Now we CREDIT the target wallet.
        
        UPDATE wallets
        SET balance = balance + v_to_amount
        WHERE id = v_to_wallet_id;

        UPDATE transactions 
        SET status = 'COMPLETED',
            external_hash = p_provider_hash,
            external_payout_status = p_status,
            updated_at = NOW()
        WHERE id = v_tx_id;

        -- Record the credit in the target ledger
        INSERT INTO ledger_entries (
            transaction_id, wallet_id, entry_type, amount, currency, balance_after
        ) VALUES (
            v_tx_id, v_to_wallet_id, 'CREDIT', v_to_amount, v_to_currency, 
            (SELECT balance FROM wallets WHERE id = v_to_wallet_id)
        );

        UPDATE swap_quotes SET status = 'COMPLETED' WHERE id = v_quote_id;

    ELSIF p_status = 'FAILED' THEN
        -- Provider failed the conversion. Refund the source wallet.
        UPDATE transactions 
        SET status = 'FAILED',
            external_payout_status = p_status,
            updated_at = NOW()
        WHERE id = v_tx_id;

        UPDATE wallets
        SET balance = balance + v_from_amount
        WHERE id = v_from_wallet_id;

        -- Record refund in source ledger
        INSERT INTO ledger_entries (
            transaction_id, wallet_id, entry_type, amount, currency, balance_after
        ) VALUES (
            v_tx_id, v_from_wallet_id, 'CREDIT_REFUND', v_from_amount, 
            (SELECT currency FROM wallets WHERE id = v_from_wallet_id), 
            (SELECT balance FROM wallets WHERE id = v_from_wallet_id)
        );

        UPDATE swap_quotes SET status = 'FAILED' WHERE id = v_quote_id;
    END IF;

    RETURN TRUE;
END;
$$;
