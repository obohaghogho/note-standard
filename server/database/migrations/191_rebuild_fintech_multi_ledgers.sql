-- ============================================================================
-- Migration 191: Rebuild and Stabilize Fintech Multi-Ledgers
-- ============================================================================

BEGIN;

-- 1. BOOTSTRAP INSTITUTIONAL MULTI-LEDGER SYSTEM WALLETS
-- Resolves the admin user to anchor these internal system wallets safely.
DO $$
DECLARE
    v_sys_id UUID;
    v_curr TEXT;
    v_currencies TEXT[] := ARRAY['NGN', 'USD', 'EUR', 'GBP', 'JPY'];
BEGIN
    -- Resolve primary administrative identity
    SELECT id INTO v_sys_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_sys_id IS NULL THEN
        SELECT id INTO v_sys_id FROM public.profiles LIMIT 1;
    END IF;

    IF v_sys_id IS NULL THEN
        RAISE NOTICE 'No profile found to anchor system accounts. Skipping.';
    ELSE
        FOREACH v_curr IN ARRAY v_currencies LOOP
            -- A. SETTLEMENT_PAYSTACK
            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (uuid_generate_v4(), v_sys_id, v_curr, 'SETTLEMENT_PAYSTACK', 'SETTLEMENT_PAYSTACK_' || v_curr, 'internal', 0, 0)
            ON CONFLICT DO NOTHING;

            -- B. TREASURY
            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (uuid_generate_v4(), v_sys_id, v_curr, 'TREASURY', 'TREASURY_' || v_curr, 'internal', 0, 0)
            ON CONFLICT DO NOTHING;

            -- C. REVENUE
            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (uuid_generate_v4(), v_sys_id, v_curr, 'REVENUE', 'REVENUE_' || v_curr, 'internal', 0, 0)
            ON CONFLICT DO NOTHING;

            -- D. FX_POOL
            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (uuid_generate_v4(), v_sys_id, v_curr, 'FX_POOL', 'FX_POOL_' || v_curr, 'internal', 0, 0)
            ON CONFLICT DO NOTHING;

            -- E. PENDING_DEPOSIT
            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (uuid_generate_v4(), v_sys_id, v_curr, 'PENDING_DEPOSIT', 'PENDING_DEPOSIT_' || v_curr, 'internal', 0, 0)
            ON CONFLICT DO NOTHING;

            -- F. PENDING_PAYOUT
            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (uuid_generate_v4(), v_sys_id, v_curr, 'PENDING_PAYOUT', 'PENDING_PAYOUT_' || v_curr, 'internal', 0, 0)
            ON CONFLICT DO NOTHING;

            -- G. RECONCILIATION
            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (uuid_generate_v4(), v_sys_id, v_curr, 'RECONCILIATION', 'RECONCILIATION_' || v_curr, 'internal', 0, 0)
            ON CONFLICT DO NOTHING;
        END LOOP;
        RAISE NOTICE 'Institutional system wallets bootstrapped successfully.';
    END IF;
END $$;


-- 2. REWRITE confirm_deposit TO ROUTE TO PROVIDER SETTLEMENT LEDGERS
CREATE OR REPLACE FUNCTION public.confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_external_hash TEXT DEFAULT NULL,
    p_override BOOLEAN DEFAULT FALSE,
    p_override_reason TEXT DEFAULT 'late_provider_success'
) RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_currency VARCHAR;
    v_status VARCHAR;
    v_metadata JSONB;
    v_idempotency_key TEXT;
    v_provider VARCHAR;
    v_sys_address TEXT;
    v_entries JSONB;
    v_v6_tx_id UUID;
BEGIN
    -- ATOMIC ROW-LEVEL LOCK
    SELECT 
        user_id, 
        currency, 
        status, 
        metadata,
        COALESCE(reference_id, provider_reference, id::text),
        provider
    FROM public.transactions 
    WHERE id = p_transaction_id 
    FOR UPDATE
    INTO v_user_id, v_currency, v_status, v_metadata, v_idempotency_key, v_provider;

    -- 1. FINALIZED GUARD
    IF v_status IN ('COMPLETED', 'SUCCESS') THEN
        RETURN;
    END IF;

    -- 2. STATE TRANSITION GUARD
    IF v_status NOT IN ('PENDING', 'PROCESSING', 'FAILED') THEN
        RETURN;
    END IF;

    IF v_status = 'FAILED' AND NOT p_override THEN
        RETURN;
    END IF;

    -- IDEMPOTENCY CHECK (v6 Ledger)
    SELECT id INTO v_v6_tx_id FROM public.ledger_transactions_v6 WHERE idempotency_key::text = v_idempotency_key::text;

    IF v_v6_tx_id IS NOT NULL THEN
        UPDATE public.transactions 
        SET status = 'COMPLETED',
            external_hash = COALESCE(p_external_hash, external_hash),
            completed_at = NOW(),
            updated_at = NOW(),
            metadata = COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
                'journaled', true, 
                'v6_sync', NOW(),
                'settlement_status', 'SETTLED'
            )
        WHERE id = p_transaction_id;
        RETURN;
    END IF;

    -- 3. RESOLVE PROVIDER SETTLEMENT LEDGER ADDRESS
    v_sys_address := 'SETTLEMENT_' || UPPER(COALESCE(v_provider, 'PAYSTACK')) || '_' || v_currency;
    IF NOT EXISTS (SELECT 1 FROM public.wallets_store WHERE address = v_sys_address) THEN
        v_sys_address := 'SETTLEMENT_PAYSTACK_' || v_currency;
    END IF;

    -- 4. LEDGER MATERIALIZATION (v6 Journaled)
    v_entries := jsonb_build_array(
        jsonb_build_object(
            'wallet_id', p_wallet_id,
            'user_id', v_user_id,
            'currency', v_currency,
            'amount', p_amount,
            'side', 'CREDIT'
        ),
        jsonb_build_object(
            'wallet_id', (SELECT id FROM wallets_store WHERE address = v_sys_address LIMIT 1),
            'user_id', (SELECT user_id FROM wallets_store WHERE address = v_sys_address LIMIT 1),
            'currency', v_currency,
            'amount', -p_amount,
            'side', 'DEBIT'
        )
    );

    PERFORM public.execute_ledger_transaction_v6(
        v_idempotency_key::text, 
        'DEPOSIT',
        'SETTLED',
        COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
            'external_hash', p_external_hash,
            'rpc_call', 'confirm_deposit',
            'overridden', p_override,
            'settlement_ledger', v_sys_address
        ),
        v_entries
    );

    -- 5. UPDATE LEGACY TRANSACTION RECORD
    UPDATE public.transactions 
    SET status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        completed_at = NOW(),
        updated_at = NOW(),
        metadata = COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
            'journaled', true, 
            'v6_sync', NOW(),
            'settlement_status', 'SETTLED'
        )
    WHERE id = p_transaction_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. UPGRADE execute_swap_v6 TO 5-LEG INSTITUTIONAL SPREAD LEDGER
CREATE OR REPLACE FUNCTION public.execute_swap_v6(
    p_quote_id          UUID,
    p_current_market_rate NUMERIC,
    p_idempotency_key   TEXT
) RETURNS UUID AS $$
DECLARE
    v_quote RECORD;
    v_lp_from_wallet_id UUID;
    v_lp_to_wallet_id UUID;
    v_lp_user_id UUID;
    v_rev_wallet_id UUID;
    v_rev_user_id UUID;
    v_tx_id UUID;
    v_slippage_delta NUMERIC;
    v_net_from_amount NUMERIC;
    v_entries JSONB;
BEGIN
    -- 1. Fetch and Lock Quote
    SELECT * INTO v_quote FROM public.swap_quotes WHERE id = p_quote_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: %', p_quote_id;
    END IF;

    IF v_quote.status != 'PENDING' OR v_quote.expires_at < NOW() THEN
        RAISE EXCEPTION 'QUOTE_INVALID_OR_EXPIRED: Status %, Expires %', v_quote.status, v_quote.expires_at;
    END IF;

    -- 2. Kernel Slippage Guard
    v_slippage_delta := ABS(p_current_market_rate - v_quote.rate) / v_quote.rate;
    IF v_slippage_delta > v_quote.slippage_tolerance THEN
        RAISE EXCEPTION 'SLIPPAGE_BREACH: Market rate drift % exceeds tolerance %', v_slippage_delta, v_quote.slippage_tolerance;
    END IF;

    -- 3. Identify FX Counterparty Wallets
    SELECT id, user_id INTO v_lp_from_wallet_id, v_lp_user_id 
    FROM public.wallets_store 
    WHERE address = 'FX_POOL_' || v_quote.from_currency;

    SELECT id INTO v_lp_to_wallet_id 
    FROM public.wallets_store 
    WHERE address = 'FX_POOL_' || v_quote.to_currency;

    -- Fallback to legacy SYSTEM_LP clearing if FX pools are not provisioned
    IF v_lp_from_wallet_id IS NULL THEN
        SELECT id, user_id INTO v_lp_from_wallet_id, v_lp_user_id 
        FROM public.wallets_store 
        WHERE address = 'SYSTEM_LP_' || v_quote.from_currency;
    END IF;

    IF v_lp_to_wallet_id IS NULL THEN
        SELECT id INTO v_lp_to_wallet_id 
        FROM public.wallets_store 
        WHERE address = 'SYSTEM_LP_' || v_quote.to_currency;
    END IF;

    IF v_lp_from_wallet_id IS NULL OR v_lp_to_wallet_id IS NULL THEN
        RAISE EXCEPTION 'LP_DISCOVERY_FAILURE: Missing system wallets for % or %', v_quote.from_currency, v_quote.to_currency;
    END IF;

    -- 4. Identify Revenue Wallet
    SELECT id, user_id INTO v_rev_wallet_id, v_rev_user_id
    FROM public.wallets_store
    WHERE address = 'REVENUE_' || v_quote.from_currency;

    v_net_from_amount := v_quote.from_amount - COALESCE(v_quote.fee, 0);

    -- 5. Construct balanced entries
    IF v_rev_wallet_id IS NULL OR COALESCE(v_quote.fee, 0) <= 0 THEN
        -- Standard 4-leg conversion
        v_entries := jsonb_build_array(
            jsonb_build_object(
                'wallet_id', v_quote.from_wallet_id, 
                'user_id', v_quote.user_id, 
                'currency', v_quote.from_currency, 
                'amount', -v_quote.from_amount, 
                'side', 'DEBIT'
            ),
            jsonb_build_object(
                'wallet_id', v_lp_from_wallet_id, 
                'user_id', v_lp_user_id, 
                'currency', v_quote.from_currency, 
                'amount', v_quote.from_amount, 
                'side', 'CREDIT'
            ),
            jsonb_build_object(
                'wallet_id', v_lp_to_wallet_id, 
                'user_id', v_lp_user_id, 
                'currency', v_quote.to_currency, 
                'amount', -v_quote.to_amount, 
                'side', 'DEBIT'
            ),
            jsonb_build_object(
                'wallet_id', v_quote.to_wallet_id, 
                'user_id', v_quote.user_id, 
                'currency', v_quote.to_currency, 
                'amount', v_quote.to_amount, 
                'side', 'CREDIT'
            )
        );
    ELSE
        -- Upgrade to 5-leg double-entry with Revenue isolation
        v_entries := jsonb_build_array(
            jsonb_build_object(
                'wallet_id', v_quote.from_wallet_id, 
                'user_id', v_quote.user_id, 
                'currency', v_quote.from_currency, 
                'amount', -v_quote.from_amount, 
                'side', 'DEBIT'
            ),
            jsonb_build_object(
                'wallet_id', v_rev_wallet_id, 
                'user_id', v_rev_user_id, 
                'currency', v_quote.from_currency, 
                'amount', COALESCE(v_quote.fee, 0), 
                'side', 'CREDIT'
            ),
            jsonb_build_object(
                'wallet_id', v_lp_from_wallet_id, 
                'user_id', v_lp_user_id, 
                'currency', v_quote.from_currency, 
                'amount', v_net_from_amount, 
                'side', 'CREDIT'
            ),
            jsonb_build_object(
                'wallet_id', v_lp_to_wallet_id, 
                'user_id', v_lp_user_id, 
                'currency', v_quote.to_currency, 
                'amount', -v_quote.to_amount, 
                'side', 'DEBIT'
            ),
            jsonb_build_object(
                'wallet_id', v_quote.to_wallet_id, 
                'user_id', v_quote.user_id, 
                'currency', v_quote.to_currency, 
                'amount', v_quote.to_amount, 
                'side', 'CREDIT'
            )
        );
    END IF;

    -- 6. Atomic Commit
    v_tx_id := public.execute_ledger_transaction_v6(
        p_idempotency_key,
        'SWAP',
        'SETTLED',
        jsonb_build_object(
            'quote_id', p_quote_id,
            'user_id', v_quote.user_id,
            'rate', v_quote.rate,
            'current_rate', p_current_market_rate,
            'from_currency', v_quote.from_currency,
            'to_currency', v_quote.to_currency,
            'fee', v_quote.fee,
            'revenue_allocated', COALESCE(v_quote.fee, 0)
        ),
        v_entries
    );

    -- 7. Update Quote State
    UPDATE public.swap_quotes 
    SET status = 'COMPLETED', 
        metadata = metadata || jsonb_build_object('transaction_id', v_tx_id, 'executed_at', NOW()) 
    WHERE id = p_quote_id;

    RETURN v_tx_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
