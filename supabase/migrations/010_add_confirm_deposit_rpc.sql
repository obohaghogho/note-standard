-- ============================================================================
-- NoteStandard Payment Platform — Database Migration 010
-- Add missing confirm_deposit RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount BIGINT,
    p_external_hash VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_tx RECORD;
BEGIN
    -- 1. Fetch the transaction
    SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
    END IF;

    -- Idempotency check: if already completed, do nothing
    IF v_tx.status = 'COMPLETED' OR v_tx.status = 'SUCCESS' THEN
        RETURN;
    END IF;

    -- 2. Credit the wallet using the existing idempotent function
    PERFORM credit_wallet(
        p_wallet_id,
        p_amount,
        v_tx.currency,
        p_transaction_id::VARCHAR, -- Internal reference
        'deposit',
        'Deposit via ' || COALESCE(v_tx.provider, 'paystack'),
        v_tx.provider,
        p_external_hash,
        v_tx.metadata
    );

    -- 3. Update the transaction record
    UPDATE transactions 
    SET 
        status = 'COMPLETED',
        settlement_status = 'SETTLEMENT_CONFIRMED',
        updated_at = NOW()
    WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql;
