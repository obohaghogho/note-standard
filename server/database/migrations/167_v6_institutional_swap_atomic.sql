-- ============================================================================
-- Migration 167: Institutional Swap Atomic Contract
-- ============================================================================
-- Purpose:
--   1. Replace legacy 2-leg swaps with a 4-leg institutional pattern.
--   2. Implement execute_swap_v6 RPC for atomic cross-asset exchange.
--   3. Enforce slippage and LP-liquidity invariants at the consensus layer.
-- ============================================================================

BEGIN;

-- 1. HARDENED SWAP EXECUTION RPC
CREATE OR REPLACE FUNCTION public.execute_swap_v6(
    p_quote_id          UUID,
    p_current_market_rate NUMERIC,
    p_idempotency_key   TEXT
) RETURNS UUID AS $$
DECLARE
    v_quote RECORD;
    v_user_from_wallet_id UUID;
    v_user_to_wallet_id UUID;
    v_lp_from_wallet_id UUID;
    v_lp_to_wallet_id UUID;
    v_lp_user_id UUID;
    v_tx_id UUID;
    v_slippage_delta NUMERIC;
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

    -- 2. Kernel Slippage Guard (Operational Consensus)
    v_slippage_delta := ABS(p_current_market_rate - v_quote.rate) / v_quote.rate;
    IF v_slippage_delta > v_quote.slippage_tolerance THEN
        RAISE EXCEPTION 'SLIPPAGE_BREACH: Market rate drift % exceeds tolerance %', v_slippage_delta, v_quote.slippage_tolerance;
    END IF;

    -- 3. Identify LP Counterparty Wallets
    -- We assume SYSTEM_LP wallets exist via Migration 164
    SELECT id, user_id INTO v_lp_from_wallet_id, v_lp_user_id 
    FROM public.wallets_store 
    WHERE address = 'SYSTEM_LP_' || v_quote.from_currency;

    SELECT id INTO v_lp_to_wallet_id 
    FROM public.wallets_store 
    WHERE address = 'SYSTEM_LP_' || v_quote.to_currency;

    IF v_lp_from_wallet_id IS NULL OR v_lp_to_wallet_id IS NULL THEN
        RAISE EXCEPTION 'LP_DISCOVERY_FAILURE: Missing system wallets for % or %', v_quote.from_currency, v_quote.to_currency;
    END IF;

    -- 4. Construct the 4-Leg Entry Set
    -- Leg 1: User Debit (From Asset)
    -- Leg 2: LP Credit (From Asset)
    -- Leg 3: LP Debit (To Asset)
    -- Leg 4: User Credit (To Asset)
    
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

    -- 5. Atomic Commit (via institutional pipeline)
    v_tx_id := public.execute_ledger_transaction_v6(
        p_idempotency_key,
        'SWAP',
        'SETTLED', -- Atomic internal swap moves directly to settled
        jsonb_build_object(
            'quote_id', p_quote_id,
            'user_id', v_quote.user_id,
            'rate', v_quote.rate,
            'current_rate', p_current_market_rate,
            'from_currency', v_quote.from_currency,
            'to_currency', v_quote.to_currency,
            'fee', v_quote.fee
        ),
        v_entries
    );

    -- 6. Update Quote State
    UPDATE public.swap_quotes 
    SET status = 'COMPLETED', 
        metadata = metadata || jsonb_build_object('transaction_id', v_tx_id, 'executed_at', NOW()) 
    WHERE id = p_quote_id;

    RETURN v_tx_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
