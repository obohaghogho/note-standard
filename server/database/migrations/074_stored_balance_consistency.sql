-- ============================================================================
-- Migration 074: STORED BALANCE CONSISTENCY (DATABASE INTEGRITY)
-- ============================================================================
-- Purpose:
--   1. Re-introduce stored balance columns for performance and strict locking.
--   2. Implement atomic balance updates with FOR UPDATE in RPC functions.
--   3. Maintain Ledger as the absolute audit trail.
-- ============================================================================

BEGIN;

-- 1. RESTORE STORED BALANCE COLUMNS
ALTER TABLE public.wallets_store 
    ADD COLUMN IF NOT EXISTS balance           NUMERIC(30,18) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS available_balance NUMERIC(30,18) DEFAULT 0 NOT NULL;

-- 2. INITIALIZE BALANCES FROM LEDGER
-- This ensures the new columns match the source of truth immediately.
UPDATE public.wallets_store w
SET 
    balance = (
        SELECT COALESCE(SUM(amount), 0)
        FROM public.ledger_entries
        WHERE wallet_id = w.id AND status = 'confirmed'
    ),
    available_balance = (
        SELECT (COALESCE(SUM(amount), 0) - COALESCE((SELECT SUM(ABS(amount)) FROM public.ledger_entries WHERE wallet_id = w.id AND status = 'pending' AND amount < 0), 0))
        FROM public.ledger_entries
        WHERE wallet_id = w.id AND status = 'confirmed'
    );

-- 3. REFACTOR CORE ATOMIC FUNCTIONS

-- A. SECURE WITHDRAWAL (Production Grade with FOR UPDATE)
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
    v_current_total NUMERIC;
    v_2fa_req BOOLEAN;
BEGIN
    -- 1. Lock wallet row and get current user (CRITICAL for production safety)
    SELECT user_id, available_balance 
    INTO v_user_id, v_available 
    FROM public.wallets_store 
    WHERE id = p_wallet_id 
    FOR UPDATE;
    
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    -- 2. 2FA Enforcement
    SELECT two_factor_enabled INTO v_2fa_req FROM public.profiles WHERE id = v_user_id;
    IF v_2fa_req AND NOT p_2fa_verified THEN
        INSERT INTO public.security_audit_logs (user_id, event_type, severity, description)
        VALUES (v_user_id, 'WITHDRAW_2FA_FAIL', 'WARN', 'Withdrawal attempted without 2FA verification');
        RAISE EXCEPTION '2FA_REQUIRED';
    END IF;

    -- 3. Daily Limit Enforcement
    v_limit := public.get_user_withdrawal_limit(v_user_id);
    v_current_total := public.get_daily_withdrawal_total(v_user_id, p_currency);
    
    IF (v_current_total + p_amount) > v_limit THEN
        INSERT INTO public.security_audit_logs (user_id, event_type, severity, description, payload)
        VALUES (v_user_id, 'LIMIT_EXCEEDED', 'WARN', 'Withdrawal limit exceeded', jsonb_build_object('limit', v_limit, 'attempted', p_amount, 'current', v_current_total));
        RAISE EXCEPTION 'DAILY_LIMIT_EXCEEDED (Limit: %, Current Total: %)', v_limit, v_current_total;
    END IF;

    -- 4. Sufficient Funds Check
    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds (Available: %, Required: %)', v_available, (p_amount + p_fee);
    END IF;

    -- 5. Atomic Update Stored Balances
    UPDATE public.wallets_store 
    SET balance = balance - (p_amount + p_fee),
        available_balance = available_balance - (p_amount + p_fee),
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- 6. Create Transaction & Ledger Records
    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency,
        amount_from, amount_to, status, fee, rate,
        display_label, category, provider, idempotency_key, metadata, created_at, completed_at
    ) VALUES (
        v_user_id, p_wallet_id, 'withdrawal', p_currency, p_currency,
        p_amount, p_amount, 'COMPLETED', p_fee, p_rate,
        'Withdrawal', 'withdrawal', 'internal', p_idempotency_key, p_metadata, NOW(), NOW()
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference)
    VALUES (v_user_id, p_wallet_id, p_currency, -(p_amount + p_fee), 'withdrawal', v_tx_id);

    -- 7. Platform Fee Handling
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        PERFORM public.credit_wallet_atomic(p_platform_wallet_id, p_fee, p_tx_id || '_fee');
    END IF;

    -- Audit log success
    INSERT INTO public.security_audit_logs (user_id, event_type, severity, description, payload)
    VALUES (v_user_id, 'WITHDRAWAL_SUCCESS', 'INFO', 'Withdrawal processed', jsonb_build_object('amount', p_amount, 'currency', p_currency, 'tx_id', v_tx_id));

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. LEGACY WITHDRAWAL (Hardened for consistency)
CREATE OR REPLACE FUNCTION public.withdraw_funds(
    p_wallet_id          UUID, 
    p_amount             NUMERIC, 
    p_currency           TEXT, 
    p_fee                NUMERIC, 
    p_rate               NUMERIC, 
    p_platform_wallet_id UUID, 
    p_idempotency_key    TEXT DEFAULT NULL,
    p_metadata           JSONB DEFAULT '{}'
) RETURNS UUID AS $$
BEGIN
    -- Just call the secured version without 2FA enforcement for internal use
    RETURN public.withdraw_funds_secured(
        p_wallet_id, p_amount, p_currency, p_fee, p_rate, 
        p_platform_wallet_id, p_idempotency_key, p_metadata, 
        true -- Bypass 2FA check as this is the raw/legacy call
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. ATOMIC CREDIT (Hardened)
CREATE OR REPLACE FUNCTION public.credit_wallet_atomic(
    p_wallet_id       UUID, 
    p_amount          NUMERIC, 
    p_idempotency_key TEXT DEFAULT NULL,
    p_metadata        JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE v_tx_id UUID; v_user_id UUID; v_currency VARCHAR;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;
    END IF;

    -- Lock wallet and update balance
    UPDATE public.wallets_store 
    SET balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        updated_at = NOW()
    WHERE id = p_wallet_id
    RETURNING user_id, currency INTO v_user_id, v_currency;
    
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    INSERT INTO public.transactions (user_id, wallet_id, type, from_currency, to_currency, amount_from, amount_to, status, display_label, idempotency_key, metadata)
    VALUES (v_user_id, p_wallet_id, 'deposit', v_currency, v_currency, p_amount, p_amount, 'COMPLETED', 'System Credit', p_idempotency_key, p_metadata) RETURNING id INTO v_tx_id;
    
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference)
    VALUES (v_user_id, p_wallet_id, v_currency, p_amount, 'deposit', v_tx_id);
    
    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. ATOMIC INTERNAL TRANSFER
CREATE OR REPLACE FUNCTION public.transfer_funds(
    p_sender_wallet_id   UUID, 
    p_receiver_wallet_id UUID, 
    p_amount             NUMERIC, 
    p_currency           VARCHAR, 
    p_fee                NUMERIC DEFAULT 0, 
    p_rate               NUMERIC DEFAULT 1, 
    p_platform_wallet_id UUID DEFAULT NULL, 
    p_idempotency_key    TEXT DEFAULT NULL,
    p_metadata           JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE v_tx_id UUID; v_s_uid UUID; v_r_uid UUID; v_avail NUMERIC;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;
    END IF;

    -- 1. Lock sender wallet
    SELECT user_id, available_balance INTO v_s_uid, v_avail 
    FROM public.wallets_store 
    WHERE id = p_sender_wallet_id 
    FOR UPDATE;
    
    IF v_avail < (p_amount + p_fee) THEN RAISE EXCEPTION 'Insufficient funds'; END IF;

    -- 2. Update sender
    UPDATE public.wallets_store 
    SET balance = balance - (p_amount + p_fee),
        available_balance = available_balance - (p_amount + p_fee),
        updated_at = NOW()
    WHERE id = p_sender_wallet_id;

    -- 3. Update receiver (Atomic credit)
    UPDATE public.wallets_store 
    SET balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        updated_at = NOW()
    WHERE id = p_receiver_wallet_id
    RETURNING user_id INTO v_r_uid;
    
    IF v_r_uid IS NULL THEN RAISE EXCEPTION 'Receiver wallet not found'; END IF;

    -- 4. Records
    INSERT INTO public.transactions (user_id, wallet_id, type, from_currency, to_currency, amount_from, amount_to, status, idempotency_key, metadata)
    VALUES (v_s_uid, p_sender_wallet_id, 'transfer', p_currency, p_currency, p_amount, p_amount, 'COMPLETED', p_idempotency_key, p_metadata) RETURNING id INTO v_tx_id;
    
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) VALUES (v_s_uid, p_sender_wallet_id, p_currency, -(p_amount + p_fee), 'transfer_out', v_tx_id);
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) VALUES (v_r_uid, p_receiver_wallet_id, p_currency, p_amount, 'transfer_in', v_tx_id);
    
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        PERFORM public.credit_wallet_atomic(p_platform_wallet_id, p_fee, v_tx_id || '_fee');
    END IF;
    
    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. ATOMIC SWAP
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
DECLARE v_tx_id UUID; v_avail NUMERIC;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;
    END IF;

    -- 1. Lock from_wallet
    SELECT available_balance INTO v_avail FROM public.wallets_store WHERE id = p_from_wallet_id FOR UPDATE;
    IF v_avail < (p_from_amount + p_fee) THEN RAISE EXCEPTION 'Insufficient funds for swap'; END IF;

    -- 2. Debit from
    UPDATE public.wallets_store 
    SET balance = balance - (p_from_amount + p_fee),
        available_balance = available_balance - (p_from_amount + p_fee),
        updated_at = NOW()
    WHERE id = p_from_wallet_id;

    -- 3. Credit to 
    UPDATE public.wallets_store 
    SET balance = balance + p_to_amount,
        available_balance = available_balance + p_to_amount,
        updated_at = NOW()
    WHERE id = p_to_wallet_id;

    -- 4. Records
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

    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        PERFORM public.credit_wallet_atomic(p_platform_wallet_id, p_fee, v_tx_id || '_fee');
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- E. ATOMIC DEPOSIT CONFIRMATION
CREATE OR REPLACE FUNCTION public.confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id      UUID,
    p_amount         NUMERIC,
    p_external_hash  TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE v_status TEXT;
BEGIN
    -- 1. Lock wallet
    PERFORM 1 FROM public.wallets_store WHERE id = p_wallet_id FOR UPDATE;

    -- 2. Check transaction status
    SELECT status INTO v_status FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
    IF v_status = 'COMPLETED' THEN RETURN; END IF;

    -- 3. Update Stored Balance
    UPDATE public.wallets_store 
    SET balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- 4. Update Records
    UPDATE public.transactions
    SET status = 'COMPLETED',
        external_hash = p_external_hash,
        amount_from = p_amount,
        amount_to = p_amount,
        updated_at = NOW(),
        completed_at = NOW()
    WHERE id = p_transaction_id;

    UPDATE public.ledger_entries
    SET status = 'confirmed',
        created_at = NOW()
    WHERE reference = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- F. ATOMIC PAYOUT APPROVAL
CREATE OR REPLACE FUNCTION public.approve_payout(
    p_payout_id  UUID,
    p_admin_id   UUID,
    p_note       TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_payout public.payout_requests%ROWTYPE;
BEGIN
    -- 1. Lock payout and get details
    SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
    IF v_payout.status != 'pending_review' THEN
        RAISE EXCEPTION 'Payout is not in reviewable state';
    END IF;

    -- 2. Lock wallet (though funds are already deducted from balance, they move from pending to confirmed)
    -- In Migration 072, payouts deduct from available but keep balance high until confirmed.
    -- Here, we confirm the deduction from balance.
    UPDATE public.wallets_store
    SET balance = balance - (v_payout.amount + v_payout.fee),
        updated_at = NOW()
    WHERE id = v_payout.wallet_id;

    -- 3. Update records
    UPDATE public.transactions
    SET status = 'COMPLETED',
        completed_at = NOW(),
        updated_at = NOW(),
        metadata = metadata || jsonb_build_object('approved_by', p_admin_id, 'approval_note', p_note)
    WHERE id = v_payout.transaction_id;

    UPDATE public.ledger_entries
    SET status = 'confirmed',
        created_at = NOW()
    WHERE reference = v_payout.transaction_id;

    UPDATE public.payout_requests
    SET status = 'approved',
        reviewed_by = p_admin_id,
        reviewed_at = NOW(),
        review_note = p_note,
        updated_at = NOW()
    WHERE id = p_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. UPDATE INTERFACE VIEW
-- Switch from calculated values to stored values for high performance.
-- Explicitly drop view because type changed from NUMERIC (calc) to NUMERIC(30,18) (stored)
DROP VIEW IF EXISTS public.wallets CASCADE;

CREATE VIEW public.wallets AS
SELECT 
    id, user_id, currency, address, is_frozen, created_at, updated_at,
    balance, available_balance
FROM public.wallets_store;

-- 5. RE-APPLY VIEW TRIGGERS (Lost during CASCADE drop)
CREATE TRIGGER trg_wallets_upsert
INSTEAD OF INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.trg_wallets_upsert_fn();

COMMIT;
