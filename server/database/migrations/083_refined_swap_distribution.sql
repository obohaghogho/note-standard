-- Migration 083: Refined Atomic Swap Distribution (Inclusive Fees)
-- Implementation of 6% Admin / 0.5% Referrer / 1% Reward User.
-- Fees are deducted FROM the amount entered by the user.

BEGIN;

CREATE OR REPLACE FUNCTION public.execute_swap_from_quote(
    p_quote_id UUID,
    p_current_market_rate NUMERIC,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_quote          RECORD;
    v_tx_id          UUID;
    v_txn_ref        TEXT;
    v_price_diff     NUMERIC;
    v_slippage_pct   NUMERIC;
    
    -- Fee Breakdown (Calculated from Gross Amount)
    v_admin_fee        NUMERIC;
    v_referrer_fee     NUMERIC;
    v_reward_user_fee  NUMERIC;
    v_total_fee        NUMERIC;
    v_net_amount       NUMERIC;
    
    -- Targets
    v_admin_user_id    UUID;
    v_referrer_id      UUID;
    v_reward_user_id   UUID;
    
    -- Wallets
    v_admin_wallet_id  UUID;
    v_referrer_wallet_id UUID;
    v_reward_wallet_id  UUID;
BEGIN
    -- 1. Lock and validate the quote
    SELECT * INTO v_quote FROM public.swap_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND'; END IF;
    IF v_quote.status != 'PENDING' THEN RAISE EXCEPTION 'QUOTE_ALREADY_USED_OR_EXPIRED'; END IF;
    IF v_quote.expires_at < NOW() THEN 
        UPDATE public.swap_quotes SET status = 'EXPIRED' WHERE id = p_quote_id;
        RAISE EXCEPTION 'QUOTE_EXPIRED'; 
    END IF;

    -- 2. Slippage Verification
    IF p_current_market_rate IS NOT NULL AND p_current_market_rate > 0 THEN
        v_price_diff := abs(v_quote.rate - p_current_market_rate);
        v_slippage_pct := v_price_diff / v_quote.rate;
        
        IF v_slippage_pct > v_quote.slippage_tolerance THEN
            UPDATE public.swap_quotes SET status = 'EXPIRED', metadata = metadata || jsonb_build_object('failure_reason', 'SLIPPAGE_EXCEEDED') WHERE id = p_quote_id;
            RAISE EXCEPTION 'SLIPPAGE_TOLERANCE_EXCEEDED';
        END IF;
    END IF;

    -- 3. Calculate Fees (Inclusive: Deducted from v_quote.from_amount)
    v_admin_fee := v_quote.from_amount * 0.06;
    v_reward_user_fee := v_quote.from_amount * 0.01;
    v_total_fee := v_admin_fee + v_reward_user_fee;
    
    -- Add referrer fee if referrer exists
    SELECT referrer_user_id INTO v_referrer_id FROM public.affiliate_referrals WHERE referred_user_id = v_quote.user_id LIMIT 1;
    IF v_referrer_id IS NOT NULL THEN
        v_referrer_fee := v_quote.from_amount * 0.005;
        v_total_fee := v_total_fee + v_referrer_fee;
    ELSE
        v_referrer_fee := 0;
    END IF;

    v_net_amount := v_quote.from_amount - v_total_fee;

    -- 4. Verify User Balance (Check against GROSS amount)
    IF (SELECT available_balance FROM public.wallets WHERE id = v_quote.from_wallet_id) < v_quote.from_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
    END IF;

    -- 5. Atomic Fee Distribution
    -- A. Admin Fee
    SELECT wallet_id INTO v_admin_wallet_id FROM public.platform_wallets WHERE currency = v_quote.from_currency LIMIT 1;
    
    -- Fallback: If no platform wallet, find any admin user's wallet
    IF v_admin_wallet_id IS NULL THEN
        SELECT w.id INTO v_admin_wallet_id 
        FROM public.wallets_store w
        JOIN public.profiles p ON w.user_id = p.id
        WHERE p.role = 'admin' AND w.currency = v_quote.from_currency 
        LIMIT 1;
    END IF;

    IF v_admin_wallet_id IS NOT NULL AND v_admin_fee > 0 THEN
        UPDATE public.wallets_store SET balance = balance + v_admin_fee, available_balance = available_balance + v_admin_fee WHERE id = v_admin_wallet_id;
    END IF;

    -- B. Reward User Fee
    SELECT (value->>0)::UUID INTO v_reward_user_id FROM public.admin_settings WHERE key = 'global_reward_user_id' LIMIT 1;
    IF v_reward_user_id IS NOT NULL AND v_reward_user_fee > 0 THEN
        SELECT id INTO v_reward_wallet_id FROM public.wallets_store WHERE user_id = v_reward_user_id AND currency = v_quote.from_currency LIMIT 1;
        IF v_reward_wallet_id IS NOT NULL THEN
            UPDATE public.wallets_store SET balance = balance + v_reward_user_fee, available_balance = available_balance + v_reward_user_fee WHERE id = v_reward_wallet_id;
        END IF;
    END IF;

    -- C. Referrer Fee
    IF v_referrer_id IS NOT NULL AND v_referrer_fee > 0 THEN
        SELECT id INTO v_referrer_wallet_id FROM public.wallets_store WHERE user_id = v_referrer_id AND currency = v_quote.from_currency LIMIT 1;
        IF v_referrer_wallet_id IS NOT NULL THEN
            UPDATE public.wallets_store SET balance = balance + v_referrer_fee, available_balance = available_balance + v_referrer_fee WHERE id = v_referrer_wallet_id;
        END IF;
    END IF;

    -- 6. User Balance Updates
    -- Deduct GROSS from source
    UPDATE public.wallets_store 
    SET balance = balance - v_quote.from_amount,
        available_balance = available_balance - v_quote.from_amount,
        updated_at = NOW()
    WHERE id = v_quote.from_wallet_id;

    -- Credit Users TO amount
    UPDATE public.wallets_store 
    SET balance = balance + v_quote.to_amount,
        available_balance = available_balance + v_quote.to_amount,
        updated_at = NOW()
    WHERE id = v_quote.to_wallet_id;

    -- 7. Record Transaction
    v_txn_ref := 'SWAP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::text FROM 1 FOR 6));
    
    INSERT INTO public.transactions (
        user_id, wallet_id, type, currency, amount, from_currency, to_currency, 
        amount_from, amount_to, rate, fee, status, 
        idempotency_key, txn_reference, metadata,
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
            'net_amount', v_net_amount
        ),
        NOW(), NOW()
    ) RETURNING id INTO v_tx_id;

    -- Update Quote
    UPDATE public.swap_quotes SET status = 'EXECUTED', metadata = metadata || jsonb_build_object('tx_id', v_tx_id) WHERE id = p_quote_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
