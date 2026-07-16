-- ====================================
-- UPDATE TRANSFER FUNCTION FOR COMMISSIONS
-- ====================================

CREATE OR REPLACE FUNCTION transfer_funds(
    p_sender_wallet_id UUID,
    p_receiver_wallet_id UUID,
    p_amount NUMERIC,
    p_currency VARCHAR,
    p_fee NUMERIC DEFAULT 0,
    p_rate NUMERIC DEFAULT 0, -- NEW: Commission rate applied (for logging)
    p_platform_wallet_id UUID DEFAULT NULL, -- Destination for the fee
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$ 
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
    v_sender_user_id UUID;
    v_total_deduction NUMERIC;
BEGIN
    v_total_deduction := p_amount + p_fee;

    -- Get sender user_id for logging
    SELECT user_id INTO v_sender_user_id FROM wallets WHERE id = p_sender_wallet_id;

    -- Check balance
    IF (SELECT balance FROM wallets WHERE id = p_sender_wallet_id) < v_total_deduction THEN
        RAISE EXCEPTION 'Insufficient funds (Amount + Fee)';
    END IF;

    -- Generate reference ID
    v_ref_id := uuid_generate_v4();

    -- 1. Debit Sender (Amount + Fee)
    UPDATE wallets 
    SET balance = balance - v_total_deduction
    WHERE id = p_sender_wallet_id;

    -- 2. Credit Receiver (Amount only)
    UPDATE wallets 
    SET balance = balance + p_amount 
    WHERE id = p_receiver_wallet_id;

    -- 3. Credit Platform Wallet (Fee) - if provided and fee > 0
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        UPDATE wallets
        SET balance = balance + p_fee
        WHERE id = p_platform_wallet_id;
    END IF;

    -- 4. Record Sender Transaction (TRANSFER_OUT)
    INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_sender_wallet_id, 'TRANSFER_OUT', p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee, p_metadata)
    RETURNING id INTO v_tx_id;

    -- 5. Record Receiver Transaction (TRANSFER_IN)
    INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_receiver_wallet_id, 'TRANSFER_IN', p_amount, p_currency, 'COMPLETED', v_ref_id, 0, p_metadata);

    -- 6. Record Platform Transaction & Commission Log
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
         -- Internal Ledger for Platform Wallet
         INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
         VALUES (p_platform_wallet_id, 'COMMISSION_COLLECTED', p_fee, p_currency, 'COMPLETED', v_ref_id, 0, jsonb_build_object('source_tx_id', v_tx_id));
         
         -- Dedicated Commissions Log
         INSERT INTO commissions (transaction_id, source_user_id, amount, currency, rate_applied, platform_wallet_id)
         VALUES (v_tx_id, v_sender_user_id, p_fee, p_currency, p_rate, p_platform_wallet_id);
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
