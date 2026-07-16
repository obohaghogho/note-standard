-- ============================================================================
-- Migration 076: SECURITY LAYERS (ADMIN LIMITS & PENDING WITHDRAWALS)
-- ============================================================================
-- Purpose:
--   1. Enforce minimum withdrawal and maximum swap limits.
--   2. Implement mandatory 'PENDING' status for all withdrawals.
--   3. Create admin approval flow for withdrawals.
-- ============================================================================

BEGIN;

-- 1. INITIALIZE GLOBAL LIMITS IN ADMIN_SETTINGS
-- These act as global defaults if not overridden per-user/plan.
INSERT INTO public.admin_settings (key, value) VALUES
('min_withdrawal_amount', '10.0'), -- 10 USD equivalent
('max_swap_amount', '5000.0')      -- 5000 USD equivalent
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. REFACTOR WITHDRAWAL RPC (Mandatory PENDING Flow)
CREATE OR REPLACE FUNCTION public.withdraw_funds_secured(
    p_wallet_id          UUID, 
    p_amount             NUMERIC, 
    p_currency           TEXT, 
    p_fee                NUMERIC, 
    p_rate               NUMERIC, 
    p_platform_wallet_id UUID, 
    p_idempotency_key    TEXT DEFAULT NULL,
    p_metadata           JSONB DEFAULT '{}',
    p_2fa_verified       BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_user_id UUID;
    v_available NUMERIC;
    v_limit NUMERIC;
    v_min_withdraw NUMERIC;
    v_current_total NUMERIC;
    v_2fa_req BOOLEAN;
BEGIN
    -- 1. Lock wallet row (CRITICAL for production safety)
    SELECT user_id, available_balance 
    INTO v_user_id, v_available 
    FROM public.wallets_store 
    WHERE id = p_wallet_id 
    FOR UPDATE;
    
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    -- 2. Minimum Withdrawal Check
    SELECT (value#>>'{}')::NUMERIC INTO v_min_withdraw FROM public.admin_settings WHERE key = 'min_withdrawal_amount';
    -- Note: For multi-currency, this should ideally use a USD conversion, 
    -- but for strictness we enforce raw amount or plan limits. 
    IF p_amount < v_min_withdraw THEN
        RAISE EXCEPTION 'MINIMUM_WITHDRAWAL_NOT_MET (Min: %, Req: %)', v_min_withdraw, p_amount;
    END IF;

    -- 3. 2FA Enforcement
    SELECT two_factor_enabled INTO v_2fa_req FROM public.profiles WHERE id = v_user_id;
    IF v_2fa_req AND NOT p_2fa_verified THEN
        INSERT INTO public.security_audit_logs (user_id, event_type, severity, description)
        VALUES (v_user_id, 'WITHDRAW_2FA_FAIL', 'WARN', 'Withdrawal attempted without 2FA verification');
        RAISE EXCEPTION '2FA_REQUIRED';
    END IF;

    -- 4. Daily Limit Enforcement
    v_limit := public.get_user_withdrawal_limit(v_user_id);
    v_current_total := public.get_daily_withdrawal_total(v_user_id, p_currency);
    
    IF (v_current_total + p_amount) > v_limit THEN
        INSERT INTO public.security_audit_logs (user_id, event_type, severity, description, payload)
        VALUES (v_user_id, 'LIMIT_EXCEEDED', 'WARN', 'Withdrawal limit exceeded', jsonb_build_object('limit', v_limit, 'attempted', p_amount, 'current', v_current_total));
        RAISE EXCEPTION 'DAILY_LIMIT_EXCEEDED (Limit: %, Current Total: %)', v_limit, v_current_total;
    END IF;

    -- 5. Sufficient Funds Check
    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds (Available: %, Required: %)', v_available, (p_amount + p_fee);
    END IF;

    -- 6. Atomic Update Available Balance (ONLY)
    -- Total balance remains high until approved. Available drops immediately.
    UPDATE public.wallets_store 
    SET available_balance = available_balance - (p_amount + p_fee),
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- 7. Create Transaction (PENDING)
    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency,
        amount_from, amount_to, status, fee, rate,
        display_label, category, provider, idempotency_key, metadata, created_at
    ) VALUES (
        v_user_id, p_wallet_id, 'withdrawal', p_currency, p_currency,
        p_amount, p_amount, 'PENDING', p_fee, p_rate,
        'Withdrawal Request', 'withdrawal', 'internal', p_idempotency_key, p_metadata, NOW()
    ) RETURNING id INTO v_tx_id;

    -- 8. Create Ledger Entry (PENDING)
    -- Status 'pending' means it only affects available_balance (see Migration 072 logic)
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status)
    VALUES (v_user_id, p_wallet_id, p_currency, -(p_amount + p_fee), 'withdrawal', v_tx_id, 'pending');

    -- Audit log initiation
    INSERT INTO public.security_audit_logs (user_id, event_type, severity, description, payload)
    VALUES (v_user_id, 'WITHDRAWAL_INITIATED', 'INFO', 'Withdrawal request pending approval', jsonb_build_object('amount', p_amount, 'currency', p_currency, 'tx_id', v_tx_id));

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. NEW APPROVAL RPC
CREATE OR REPLACE FUNCTION public.approve_withdrawal(
    p_transaction_id UUID,
    p_admin_id       UUID,
    p_note           TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_tx public.transactions%ROWTYPE;
    v_total NUMERIC;
BEGIN
    -- 1. Lock transaction
    SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
    IF v_tx.status != 'PENDING' THEN RAISE EXCEPTION 'Transaction is not in PENDING state'; END IF;

    -- 2. Lock wallet
    PERFORM 1 FROM public.wallets_store WHERE id = v_tx.wallet_id FOR UPDATE;

    -- 3. Finalize Balance (Decrement Total Balance)
    -- Available was already decremented at initiation.
    UPDATE public.wallets_store 
    SET balance = balance - (v_tx.amount_from + COALESCE(v_tx.fee, 0)),
        updated_at = NOW()
    WHERE id = v_tx.wallet_id;

    -- 4. Mark Transaction COMPLETED
    UPDATE public.transactions 
    SET status = 'COMPLETED',
        completed_at = NOW(),
        updated_at = NOW(),
        metadata = metadata || jsonb_build_object('approved_by', p_admin_id, 'approval_note', p_note)
    WHERE id = p_transaction_id;

    -- 5. Finalize Ledger Entry
    UPDATE public.ledger_entries 
    SET status = 'confirmed',
        created_at = NOW()
    WHERE reference = p_transaction_id;

    -- 6. Handle Platform Fee (if applicable)
    IF v_tx.fee > 0 THEN
        -- Credit platform wallet (Implementation depends on platform wallet lookup)
        -- For now, we assume credit_wallet_atomic handles it via legacy service logic.
    END IF;

    -- 7. Audit log
    INSERT INTO public.security_audit_logs (user_id, event_type, severity, description, payload)
    VALUES (v_tx.user_id, 'WITHDRAWAL_APPROVED', 'INFO', 'Withdrawal request approved by admin', jsonb_build_object('tx_id', p_transaction_id, 'admin_id', p_admin_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. REFACTOR SWAP RPC (Maximum Swap Limit)
CREATE OR REPLACE FUNCTION public.execute_swap_atomic(
    p_user_id           UUID,
    p_from_wallet_id    UUID,
    p_to_wallet_id      UUID,
    p_from_amount       NUMERIC,
    p_to_amount         NUMERIC,
    p_from_currency     VARCHAR,
    p_to_currency       VARCHAR,
    p_rate              NUMERIC,
    p_spread_amount     NUMERIC DEFAULT 0,
    p_fee               NUMERIC DEFAULT 0,
    p_platform_wallet_id UUID DEFAULT NULL,
    p_idempotency_key   TEXT DEFAULT NULL,
    p_metadata          JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE v_tx_id UUID; v_avail NUMERIC; v_max_swap NUMERIC;
BEGIN
    -- 1. Max Swap Limit Check
    SELECT (value#>>'{}')::NUMERIC INTO v_max_swap FROM public.admin_settings WHERE key = 'max_swap_amount';
    IF p_from_amount > v_max_swap THEN
        RAISE EXCEPTION 'MAX_SWAP_EXCEEDED (Max: %, Req: %)', v_max_swap, p_from_amount;
    END IF;

    -- 2. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;
    END IF;

    -- 3. Lock from_wallet
    SELECT available_balance INTO v_avail FROM public.wallets_store WHERE id = p_from_wallet_id FOR UPDATE;
    IF v_avail < (p_from_amount + p_fee) THEN RAISE EXCEPTION 'Insufficient funds for swap'; END IF;

    -- 4. Atomic Balance Update (Both available and total)
    UPDATE public.wallets_store 
    SET balance = balance - (p_from_amount + p_fee),
        available_balance = available_balance - (p_from_amount + p_fee),
        updated_at = NOW()
    WHERE id = p_from_wallet_id;

    UPDATE public.wallets_store 
    SET balance = balance + p_to_amount,
        available_balance = available_balance + p_to_amount,
        updated_at = NOW()
    WHERE id = p_to_wallet_id;

    -- 5. Records
    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency, 
        amount_from, amount_to, rate, fee, status, idempotency_key, metadata
    ) VALUES (
        p_user_id, p_from_wallet_id, 'swap', p_from_currency, p_to_currency, 
        p_from_amount, p_to_amount, p_rate, p_fee, 'COMPLETED', p_idempotency_key, p_metadata
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) 
    VALUES (p_user_id, p_from_wallet_id, p_from_currency, -(p_from_amount + p_fee), 'swap_debit', v_tx_id);

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) 
    VALUES (p_user_id, p_to_wallet_id, p_to_currency, p_to_amount, 'swap_credit', v_tx_id);

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
