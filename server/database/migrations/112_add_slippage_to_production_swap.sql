-- Migration 112: Add Slippage Enforcement to Production Swap
-- This migration updates execute_production_swap to accept p_current_market_rate
-- and verify that the price hasn't moved unfavorably beyond the slippage tolerance.

BEGIN;

CREATE OR REPLACE FUNCTION public.execute_production_swap(
    p_quote_id UUID,
    p_current_market_rate NUMERIC, -- NEW: Exact rate at moment of execution
    p_idempotency_key TEXT DEFAULT NULL,
    p_admin_rate NUMERIC DEFAULT 0.045,
    p_partner_rate NUMERIC DEFAULT 0.001,
    p_referrer_rate NUMERIC DEFAULT 0.001
) RETURNS UUID AS $$
DECLARE
    v_quote          RECORD;
    v_tx_id          UUID;
    v_txn_ref        TEXT;
    
    -- Fee Breakdown
    v_admin_fee        NUMERIC;
    v_referrer_fee     NUMERIC;
    v_reward_user_fee  NUMERIC;
    v_total_fee        NUMERIC;
    v_net_amount       NUMERIC;
    
    -- Targets
    v_referrer_id      UUID;
    v_reward_user_id   UUID;
    
    -- Wallets
    v_admin_wallet_id  UUID;

    -- Slippage Check
    v_price_diff       NUMERIC;
    v_slippage_pct     NUMERIC;
BEGIN
    -- 1. Lock and validate the quote
    SELECT * INTO v_quote FROM public.swap_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND'; END IF;
    IF v_quote.status != 'PENDING' THEN RAISE EXCEPTION 'QUOTE_ALREADY_USED_OR_EXPIRED'; END IF;
    IF v_quote.expires_at < NOW() THEN 
        UPDATE public.swap_quotes SET status = 'EXPIRED' WHERE id = p_quote_id;
        RAISE EXCEPTION 'QUOTE_EXPIRED'; 
    END IF;

    -- 1.2 SLIPPAGE VERIFICATION
    IF p_current_market_rate IS NOT NULL AND p_current_market_rate > 0 THEN
        -- We calculate how MUCH the price moved from the quote.
        -- If current rate is LOWER than quote rate, it's unfavorable for the user (they get less).
        -- We use absolute difference for simplicity, or specific direction check.
        v_price_diff := abs(v_quote.rate - p_current_market_rate);
        v_slippage_pct := v_price_diff / v_quote.rate;
        
        -- Use default 0.5% if slippage_tolerance is null
        IF v_slippage_pct > COALESCE(v_quote.slippage_tolerance, 0.005) THEN
            UPDATE public.swap_quotes 
            SET status = 'EXPIRED', 
                metadata = metadata || jsonb_build_object(
                    'failure_reason', 'SLIPPAGE_EXCEEDED', 
                    'target_rate', v_quote.rate,
                    'actual_rate', p_current_market_rate,
                    'slippage_pct', v_slippage_pct
                ) 
            WHERE id = p_quote_id;
            
            RAISE EXCEPTION 'SLIPPAGE_TOLERANCE_EXCEEDED (Max: %, Actual: %)', 
                COALESCE(v_quote.slippage_tolerance, 0.005), 
                v_slippage_pct;
        END IF;
    END IF;

    -- 2. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;
    END IF;

    -- 3. Calculate Fees using provided rates
    v_admin_fee := v_quote.from_amount * p_admin_rate;
    v_reward_user_fee := v_quote.from_amount * p_partner_rate;
    v_total_fee := v_admin_fee + v_reward_user_fee;
    
    -- Check for referrer
    SELECT referrer_id INTO v_referrer_id FROM public.profiles WHERE id = v_quote.user_id LIMIT 1;
    IF v_referrer_id IS NOT NULL THEN
        v_referrer_fee := v_quote.from_amount * p_referrer_rate;
        v_total_fee := v_total_fee + v_referrer_fee;
    ELSE
        v_referrer_fee := 0;
    END IF;

    v_net_amount := v_quote.from_amount - v_total_fee;

    -- 4. Verify User Balance
    IF (SELECT balance FROM public.wallets_store WHERE id = v_quote.from_wallet_id FOR UPDATE) < v_quote.from_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
    END IF;

    -- 5. ATOMIC EXECUTION (Update Balances)
    UPDATE public.wallets_store 
    SET balance = balance - v_quote.from_amount,
        available_balance = available_balance - v_quote.from_amount,
        updated_at = NOW()
    WHERE id = v_quote.from_wallet_id;

    -- NOTE: We use the quote's to_amount. In a real system with real-time slippage, 
    -- we might recalculate to_amount based on p_current_market_rate * v_net_amount.
    -- However, for internal swaps, we honor the locked quote if slippage check passes.
    UPDATE public.wallets_store 
    SET balance = balance + v_quote.to_amount,
        available_balance = available_balance + v_quote.to_amount,
        updated_at = NOW()
    WHERE id = v_quote.to_wallet_id;

    -- Distribute Fees
    -- Admin
    SELECT wallet_id INTO v_admin_wallet_id FROM public.platform_wallets WHERE currency = v_quote.from_currency LIMIT 1;
    IF v_admin_wallet_id IS NULL THEN
        SELECT w.id INTO v_admin_wallet_id FROM public.wallets_store w JOIN public.profiles p ON w.user_id = p.id 
        WHERE p.role = 'admin' AND w.currency = v_quote.from_currency LIMIT 1;
    END IF;
    IF v_admin_wallet_id IS NOT NULL AND v_admin_fee > 0 THEN
        UPDATE public.wallets_store SET balance = balance + v_admin_fee, available_balance = available_balance + v_admin_fee WHERE id = v_admin_wallet_id;
    END IF;

    -- Reward User (mapped to p_partner_rate/partner_fee)
    SELECT (value->>0)::UUID INTO v_reward_user_id FROM public.admin_settings WHERE key = 'global_reward_user_id' LIMIT 1;
    IF v_reward_user_id IS NOT NULL AND v_reward_user_fee > 0 THEN
        UPDATE public.wallets_store SET balance = balance + v_reward_user_fee, available_balance = available_balance + v_reward_user_fee 
        WHERE user_id = v_reward_user_id AND currency = v_quote.from_currency;
    END IF;

    -- Referrer
    IF v_referrer_id IS NOT NULL AND v_referrer_fee > 0 THEN
        UPDATE public.wallets_store SET balance = balance + v_referrer_fee, available_balance = available_balance + v_referrer_fee 
        WHERE user_id = v_referrer_id AND currency = v_quote.from_currency;
    END IF;

    -- 6. RECORD TRANSACTIONS
    v_txn_ref := 'SWAP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::text FROM 1 FOR 6));
    
    INSERT INTO public.transactions (
        user_id, wallet_id, type, currency, amount, from_currency, to_currency, 
        amount_from, amount_to, rate, fee, status, 
        idempotency_key, reference_id, metadata,
        category, product_type, display_label,
        created_at, completed_at
    ) VALUES (
        v_quote.user_id, v_quote.from_wallet_id, 'swap', v_quote.from_currency, v_quote.from_amount, v_quote.from_currency, v_quote.to_currency, 
        v_quote.from_amount, v_quote.to_amount, v_quote.rate, v_total_fee, 'COMPLETED', 
        p_idempotency_key, v_txn_ref, 
        v_quote.metadata || jsonb_build_object(
            'quote_id', p_quote_id, 
            'admin_fee', v_admin_fee,
            'referrer_fee', v_referrer_fee,
            'reward_user_fee', v_reward_user_fee,
            'net_amount', v_net_amount,
            'execution_rate', p_current_market_rate,
            'fee_rates', jsonb_build_object(
                'admin', p_admin_rate,
                'partner', p_partner_rate,
                'referrer', p_referrer_rate
            )
        ),
        'swap', 'digital_asset', 'Currency Swap',
        NOW(), NOW()
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.swaps (user_id, from_currency, to_currency, from_amount, to_amount, rate, fee)
    VALUES (v_quote.user_id, v_quote.from_currency, v_quote.to_currency, v_quote.from_amount, v_quote.to_amount, v_quote.rate, v_total_fee);

    INSERT INTO public.fees (transaction_id, admin_fee, partner_fee, referral_fee)
    VALUES (v_tx_id, v_admin_fee, v_reward_user_fee, v_referrer_fee);

    UPDATE public.swap_quotes SET status = 'EXECUTED', updated_at = NOW() WHERE id = p_quote_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
