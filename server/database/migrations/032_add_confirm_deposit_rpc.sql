-- Migration: Add confirm_deposit RPC function for atomic wallet crediting
-- This function ensures atomic updates to prevent race conditions and double-crediting

-- Create the function
CREATE OR REPLACE FUNCTION confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount DECIMAL,
    p_external_hash TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_status TEXT;
    v_current_balance DECIMAL;
BEGIN
    -- Lock the transaction row to prevent concurrent updates
    SELECT status INTO v_current_status
    FROM transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    -- Check if already completed (idempotency)
    IF v_current_status = 'COMPLETED' THEN
        -- Already processed, silently return
        RETURN;
    END IF;

    -- Check if failed (cannot confirm failed transactions)
    IF v_current_status = 'FAILED' THEN
        RAISE EXCEPTION 'Cannot confirm a failed transaction';
    END IF;

    -- Check if pending
    IF v_current_status != 'PENDING' THEN
        RAISE EXCEPTION 'Transaction is not in PENDING status';
    END IF;

    -- Lock wallet row and get current balance
    SELECT balance INTO v_current_balance
    FROM wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;

    -- Update wallet balance
    UPDATE wallets
    SET 
        balance = v_current_balance + p_amount,
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Update transaction status
    UPDATE transactions
    SET 
        status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        updated_at = NOW()
    WHERE id = p_transaction_id;

END;
$$;

-- Grant execute permission to authenticated users (via service role)
GRANT EXECUTE ON FUNCTION confirm_deposit TO service_role;

-- Also create a function to check deposit status
CREATE OR REPLACE FUNCTION get_deposit_by_reference(p_reference TEXT)
RETURNS TABLE (
    id UUID,
    wallet_id UUID,
    type TEXT,
    amount DECIMAL,
    currency TEXT,
    status TEXT,
    reference_id TEXT,
    external_hash TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.wallet_id,
        t.type,
        t.amount,
        t.currency,
        t.status,
        t.reference_id,
        t.external_hash,
        t.created_at,
        t.updated_at
    FROM transitions t
    WHERE t.reference_id = p_reference;
END;
$$;

GRANT EXECUTE ON FUNCTION get_deposit_by_reference TO authenticated;
GRANT EXECUTE ON FUNCTION get_deposit_by_reference TO service_role;
