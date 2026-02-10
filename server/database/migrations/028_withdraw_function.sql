-- ====================================
-- WITHDRAW FUNCTION
-- ====================================

CREATE OR REPLACE FUNCTION withdraw_funds(
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_currency VARCHAR,
    p_fee NUMERIC DEFAULT 0,
    p_rate NUMERIC DEFAULT 0,
    p_platform_wallet_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
    v_total_deduction NUMERIC;
    v_user_id UUID;
BEGIN
    v_total_deduction := p_amount + p_fee;

    -- Get user ID
    SELECT user_id INTO v_user_id FROM wallets WHERE id = p_wallet_id;

    -- Check balance
    IF (SELECT balance FROM wallets WHERE id = p_wallet_id) < v_total_deduction THEN
        RAISE EXCEPTION 'Insufficient funds (Amount + Fee)';
    END IF;

    v_ref_id := uuid_generate_v4();

    -- 1. Debit User (Amount + Fee)
    UPDATE wallets 
    SET balance = balance - v_total_deduction 
    WHERE id = p_wallet_id;

    -- 2. Credit Platform Wallet (Amount + Fee) - The platform holds the funds to pay out via Bank
    IF p_platform_wallet_id IS NOT NULL THEN
        UPDATE wallets
        SET balance = balance + v_total_deduction
        WHERE id = p_platform_wallet_id;
    END IF;

    -- 3. Record Withdrawal Transaction
    INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_wallet_id, 'WITHDRAWAL', p_amount, p_currency, 'PENDING', v_ref_id, p_fee, p_metadata)
    RETURNING id INTO v_tx_id;

    -- 4. Record Platform Deposit (If tracked)
    IF p_platform_wallet_id IS NOT NULL THEN
        INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
        VALUES (p_platform_wallet_id, 'DEPOSIT', p_amount, p_currency, 'COMPLETED', v_ref_id, 0, jsonb_build_object('source_tx_id', v_tx_id, 'type', 'WITHDRAWAL_COLLECTION'));
        
        -- And record the fee specifically? 
        -- Actually, for withdrawals, usually the fee is retained by the platform, and the 'Amount' is sent to the user's bank.
        -- So the Platform Wallet gains 'Amount + Fee', and then 'Amount' leaves the system (via Bank API).
        -- The 'Fee' stays in the Platform Wallet.
        -- So we should log the commission.
        
        INSERT INTO commissions (transaction_id, source_user_id, amount, currency, rate_applied, platform_wallet_id)
        VALUES (v_tx_id, v_user_id, p_fee, p_currency, p_rate, p_platform_wallet_id);
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
