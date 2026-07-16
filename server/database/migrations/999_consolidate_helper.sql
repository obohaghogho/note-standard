-- Helper for consolidating wallet balances during migration
CREATE OR REPLACE FUNCTION public.consolidate_wallet_balance(
    p_source_id UUID,
    p_target_id UUID
) RETURNS void AS $$
DECLARE
    v_balance NUMERIC;
    v_available NUMERIC;
BEGIN
    -- 1. Get balance from source
    SELECT balance, available_balance INTO v_balance, v_available 
    FROM public.wallets_store 
    WHERE id = p_source_id FOR UPDATE;

    -- 2. Add to target
    UPDATE public.wallets_store 
    SET balance = balance + v_balance,
        available_balance = available_balance + v_available
    WHERE id = p_target_id;

    -- 3. Set source to zero
    UPDATE public.wallets_store 
    SET balance = 0,
        available_balance = 0
    WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
