-- 0. Standardize Table Name (Fix typo from previous migrations)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'transitions') AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'transactions') THEN
        ALTER TABLE transitions RENAME TO transactions;
    END IF;
END $$;

-- 1. Update Profiles Table for Localization
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS country_code CHAR(2),
ADD COLUMN IF NOT EXISTS base_currency CHAR(3) DEFAULT 'USD';

-- 2. Update Wallets Table for Balance Safety
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS available_balance NUMERIC(30, 18) DEFAULT 0;

-- Initialize available_balance for existing wallets
UPDATE wallets SET available_balance = balance WHERE available_balance = 0 AND balance > 0;

-- 3. Enhance Wallets with last_active_at (if not already there for presence)
-- Though the presence migration should have handled it, we ensure it's here for financial logging
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_transaction_at TIMESTAMPTZ;

-- 4. Refine Exchange Rates Table
-- Ensure it can handle global pairs e.g. 'USD-EUR', 'USD-JPY'
-- No changes needed if 'pair' is the primary key and generic enough.

-- 5. Atomic Withdraw Function Update
-- We update the existing withdraw_funds to respect available_balance
CREATE OR REPLACE FUNCTION withdraw_funds(
    p_wallet_id UUID,
    p_amount DECIMAL,
    p_currency TEXT,
    p_fee DECIMAL,
    p_rate DECIMAL,
    p_platform_wallet_id UUID,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
    v_current_available NUMERIC;
BEGIN
    -- Get current available balance
    SELECT available_balance INTO v_current_available FROM wallets WHERE id = p_wallet_id FOR UPDATE;

    -- Check available balance
    IF v_current_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient available funds';
    END IF;

    v_ref_id := uuid_generate_v4();

    -- NOTE: We deduct from available_balance immediately to block subsequent withdrawals
    -- But we only deduct from total balance when transaction is officially completed by processor (in production)
    -- Or if this is an "Instant" withdrawal, we deduct both now.
    
    UPDATE wallets 
    SET available_balance = available_balance - (p_amount + p_fee),
        balance = balance - (p_amount + p_fee),
        last_transaction_at = NOW()
    WHERE id = p_wallet_id;

    -- Credit Platform (if fee exists)
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        UPDATE wallets 
        SET balance = balance + p_fee,
            available_balance = available_balance + p_fee
        WHERE id = p_platform_wallet_id;
    END IF;

    -- Record Transaction
    INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_wallet_id, 'WITHDRAWAL', p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee, p_metadata)
    RETURNING id INTO v_tx_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Helper for Internal Transfer (Update both balances)
CREATE OR REPLACE FUNCTION transfer_funds(
    p_sender_wallet_id UUID,
    p_receiver_wallet_id UUID,
    p_amount NUMERIC,
    p_currency VARCHAR,
    p_fee NUMERIC DEFAULT 0,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
BEGIN
    -- Check available balance
    IF (SELECT available_balance FROM wallets WHERE id = p_sender_wallet_id) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient available funds';
    END IF;

    v_ref_id := uuid_generate_v4();

    -- Debit Sender (Both balances)
    UPDATE wallets 
    SET balance = balance - (p_amount + p_fee),
        available_balance = available_balance - (p_amount + p_fee),
        last_transaction_at = NOW()
    WHERE id = p_sender_wallet_id;

    -- Credit Receiver (Both balances)
    UPDATE wallets 
    SET balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        last_transaction_at = NOW()
    WHERE id = p_receiver_wallet_id;

    -- Record Sender Transaction
    INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_sender_wallet_id, 'TRANSFER_OUT', p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee, p_metadata)
    RETURNING id INTO v_tx_id;

    -- Record Receiver Transaction
    INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_receiver_wallet_id, 'TRANSFER_IN', p_amount, p_currency, 'COMPLETED', v_ref_id, 0, p_metadata);

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
