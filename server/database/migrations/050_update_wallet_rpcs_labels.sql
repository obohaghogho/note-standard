-- Migration: Update RPCs for Display Labels
-- Date: 2026-02-13

-- 1. Update transfer_funds to include display_label and category
CREATE OR REPLACE FUNCTION transfer_funds(
    p_sender_wallet_id UUID,
    p_receiver_wallet_id UUID,
    p_amount NUMERIC,
    p_currency VARCHAR,
    p_fee NUMERIC DEFAULT 0,
    p_rate NUMERIC DEFAULT 1,
    p_platform_wallet_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
    v_final_metadata JSONB;
BEGIN
    -- Check balance
    IF (SELECT balance FROM wallets WHERE id = p_sender_wallet_id) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;
    
    v_final_metadata := p_metadata || jsonb_build_object(
        'category', 'digital_assets',
        'product_type', 'digital_asset'
    );

    -- Generate reference ID for linking
    v_ref_id := uuid_generate_v4();

    -- Debit Sender
    UPDATE wallets 
    SET balance = balance - (p_amount + p_fee),
        updated_at = NOW()
    WHERE id = p_sender_wallet_id;

    -- Credit Receiver
    UPDATE wallets 
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = p_receiver_wallet_id;

    -- Credit Platform Fees
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        UPDATE wallets 
        SET balance = balance + p_fee,
            updated_at = NOW()
        WHERE id = p_platform_wallet_id;
    END IF;

    -- Record Sender Transaction
    INSERT INTO transactions (wallet_id, type, display_label, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_sender_wallet_id, 'Digital Assets Purchase', 'Digital Assets Purchase', p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee, v_final_metadata)
    RETURNING id INTO v_tx_id;

    -- Record Receiver Transaction
    INSERT INTO transactions (wallet_id, type, display_label, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_receiver_wallet_id, 'Digital Assets Purchase', 'Digital Assets Purchase', p_amount, p_currency, 'COMPLETED', v_ref_id, 0, v_final_metadata);

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update withdraw_funds to include display_label
CREATE OR REPLACE FUNCTION withdraw_funds(
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_currency TEXT,
    p_fee NUMERIC,
    p_rate NUMERIC,
    p_platform_wallet_id UUID,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
    v_final_metadata JSONB;
BEGIN
    -- Check balance
    IF (SELECT balance FROM wallets WHERE id = p_wallet_id) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;

    v_final_metadata := p_metadata || jsonb_build_object(
        'category', 'digital_assets',
        'product_type', 'digital_asset'
    );

    v_ref_id := uuid_generate_v4();

    -- Debit User
    UPDATE wallets 
    SET balance = balance - (p_amount + p_fee),
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Credit Platform
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        UPDATE wallets 
        SET balance = balance + p_fee,
            updated_at = NOW()
        WHERE id = p_platform_wallet_id;
    END IF;

    -- Record Transaction
    INSERT INTO transactions (wallet_id, type, display_label, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_wallet_id, 'Digital Assets Purchase', 'Digital Assets Purchase', p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee, v_final_metadata)
    RETURNING id INTO v_tx_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update confirm_deposit to include display_label
CREATE OR REPLACE FUNCTION confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount DECIMAL,
    p_external_hash TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Only update if still pending
    IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = p_transaction_id AND status = 'PENDING') THEN
        RETURN;
    END IF;

    -- Credit Wallet
    UPDATE wallets 
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Mark Transaction as Completed
    UPDATE transactions 
    SET status = 'COMPLETED',
        type = 'Digital Assets Purchase',
        display_label = 'Digital Assets Purchase',
        external_hash = p_external_hash,
        updated_at = NOW()
    WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
