-- Migration: 053_credit_wallet_rpc.sql
-- Description: Adds an atomic VPC for crediting wallets safely.

CREATE OR REPLACE FUNCTION credit_wallet_atomic(
    p_wallet_id UUID,
    p_amount NUMERIC
) RETURNS VOID AS $$
BEGIN
    UPDATE wallets 
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = p_wallet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
