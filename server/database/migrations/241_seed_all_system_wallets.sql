-- Migration 241: Seed All System Wallets and Set Balances
BEGIN;

DO $$
DECLARE
    v_sys_id UUID;
    v_curr TEXT;
    v_currencies TEXT[] := ARRAY['NGN', 'USD', 'EUR', 'GBP', 'JPY', 'BTC', 'ETH', 'USDT', 'USDC'];
    v_balance NUMERIC;
BEGIN
    -- Resolve primary administrative identity
    SELECT id INTO v_sys_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_sys_id IS NULL THEN
        SELECT id INTO v_sys_id FROM public.profiles LIMIT 1;
    END IF;

    IF v_sys_id IS NULL THEN
        RAISE EXCEPTION 'No profile found to anchor system accounts.';
    END IF;

    FOREACH v_curr IN ARRAY v_currencies LOOP
        -- Seed system accounts
        -- A. SYSTEM_LP
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
        VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'SYSTEM_LP_' || v_curr, 'internal', 0, 0)
        ON CONFLICT DO NOTHING;

        -- B. TREASURY 
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
        VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'TREASURY_' || v_curr, 'internal', 0, 0)
        ON CONFLICT DO NOTHING;

        -- C. REVENUE
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
        VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'REVENUE_' || v_curr, 'internal', 0, 0)
        ON CONFLICT DO NOTHING;

        -- D. SETTLEMENT_PAYSTACK
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
        VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'SETTLEMENT_PAYSTACK_' || v_curr, 'internal', 0, 0)
        ON CONFLICT DO NOTHING;

        -- E. SETTLEMENT_NOWPAYMENTS
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
        VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'SETTLEMENT_NOWPAYMENTS_' || v_curr, 'internal', 0, 0)
        ON CONFLICT DO NOTHING;

        -- F. FX_POOL
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
        VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'FX_POOL_' || v_curr, 'internal', 0, 0)
        ON CONFLICT DO NOTHING;

        -- G. PENDING_DEPOSIT
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
        VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'PENDING_DEPOSIT_' || v_curr, 'internal', 0, 0)
        ON CONFLICT DO NOTHING;

        -- H. PENDING_PAYOUT
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
        VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'PENDING_PAYOUT_' || v_curr, 'internal', 0, 0)
        ON CONFLICT DO NOTHING;

        -- I. RECONCILIATION
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
        VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'RECONCILIATION_' || v_curr, 'internal', 0, 0)
        ON CONFLICT DO NOTHING;
        
        -- Update Treasury Balance specifically
        v_balance := CASE 
            WHEN v_curr = 'NGN' THEN 20000000.0
            WHEN v_curr = 'BTC' THEN 10.0
            WHEN v_curr = 'ETH' THEN 100.0
            WHEN v_curr IN ('USDT', 'USDC') THEN 50000.0
            ELSE 100000.0
        END;
        UPDATE public.wallets_store 
        SET balance = v_balance, available_balance = v_balance
        WHERE address = 'TREASURY_' || v_curr;
    END LOOP;
END $$;

COMMIT;
