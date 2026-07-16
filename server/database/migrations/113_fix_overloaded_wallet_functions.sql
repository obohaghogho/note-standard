-- Migration 113: Fix Overloaded Wallet Functions
-- This migration drops the conflicting versions of transfer_funds and withdraw_funds 
-- to ensure the most recent (v077/v110) versions are used unambiguously.

BEGIN;

-- 1. DROP ALL POTENTIAL OVERLOADS FOR transfer_funds
-- We drop by signature to be precise based on the error logs.

-- Candidate 1 (7 params, we want to KEEP this one eventually, but drop first to avoid ambiguity issues)
DROP FUNCTION IF EXISTS public.transfer_funds(uuid, uuid, numeric, character varying, numeric, jsonb, text);

-- Candidate 2 (9 params, the old one causing conflict)
DROP FUNCTION IF EXISTS public.transfer_funds(uuid, uuid, numeric, character varying, numeric, numeric, uuid, text, jsonb);

-- Other potential stale versions
DROP FUNCTION IF EXISTS public.transfer_funds(UUID, UUID, NUMERIC, VARCHAR, NUMERIC, NUMERIC, UUID, JSONB);
DROP FUNCTION IF EXISTS public.transfer_funds(UUID, UUID, NUMERIC, VARCHAR, NUMERIC, JSONB);

-- 2. DROP CONFLICTING CONSTRAINTS
-- Internal transfers use the same reference_id to link sender/receiver.
-- Migration 106 incorrectly added a UNIQUE constraint to this column.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS unique_transaction_reference_id;

-- 3. ENSURE INTERNAL TRANSFERS ARE FREE
-- (Resets any incorrect manual settings)
UPDATE public.admin_settings SET value = '0' WHERE key = 'internal_transfer_fee';
UPDATE public.commission_settings SET value = 0.0 WHERE transaction_type = 'TRANSFER_OUT';

-- 4. RECREATE DEFINITIVE transfer_funds (From Migration 077/110)
CREATE OR REPLACE FUNCTION public.transfer_funds(
    p_sender_wallet_id UUID,
    p_receiver_wallet_id UUID,
    p_amount NUMERIC,
    p_currency VARCHAR,
    p_fee NUMERIC DEFAULT 0,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_tx_id UUID; v_ref_id UUID; v_txn_ref TEXT;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;
    END IF;

    -- Lock both wallets (Ordered by UUID to prevent deadlocks)
    IF p_sender_wallet_id < p_receiver_wallet_id THEN
        PERFORM 1 FROM public.wallets_store WHERE id = p_sender_wallet_id FOR UPDATE;
        PERFORM 1 FROM public.wallets_store WHERE id = p_receiver_wallet_id FOR UPDATE;
    ELSE
        PERFORM 1 FROM public.wallets_store WHERE id = p_receiver_wallet_id FOR UPDATE;
        PERFORM 1 FROM public.wallets_store WHERE id = p_sender_wallet_id FOR UPDATE;
    END IF;

    -- Check balance
    IF (SELECT available_balance FROM public.wallets_store WHERE id = p_sender_wallet_id) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds (Available: %, Needed: %)', (SELECT available_balance FROM public.wallets_store WHERE id = p_sender_wallet_id), (p_amount + p_fee);
    END IF;

    v_ref_id := uuid_generate_v4();
    v_txn_ref := 'TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::text FROM 1 FOR 8));

    -- Perform Transfers (Stored Balance)
    UPDATE public.wallets_store SET balance = balance - (p_amount + p_fee), available_balance = available_balance - (p_amount + p_fee) WHERE id = p_sender_wallet_id;
    UPDATE public.wallets_store SET balance = balance + p_amount, available_balance = available_balance + p_amount WHERE id = p_receiver_wallet_id;

    -- Record Transactions
    INSERT INTO public.transactions (user_id, wallet_id, type, amount_from, amount_to, from_currency, to_currency, status, reference_id, fee, metadata, idempotency_key, txn_reference)
    VALUES ((SELECT user_id FROM public.wallets_store WHERE id = p_sender_wallet_id), p_sender_wallet_id, 'TRANSFER_OUT', p_amount, p_amount, p_currency, p_currency, 'COMPLETED', v_ref_id, p_fee, p_metadata, p_idempotency_key, v_txn_ref)
    RETURNING id INTO v_tx_id;

    INSERT INTO public.transactions (user_id, wallet_id, type, amount_from, amount_to, from_currency, to_currency, status, reference_id, fee, metadata, txn_reference)
    VALUES ((SELECT user_id FROM public.wallets_store WHERE id = p_receiver_wallet_id), p_receiver_wallet_id, 'TRANSFER_IN', p_amount, p_amount, p_currency, p_currency, 'COMPLETED', v_ref_id, 0, p_metadata, v_txn_ref || '-R');

    -- Ledger
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) VALUES ((SELECT user_id FROM public.wallets_store WHERE id = p_sender_wallet_id), p_sender_wallet_id, p_currency, -(p_amount + p_fee), 'transfer_out', v_tx_id);
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) VALUES ((SELECT user_id FROM public.wallets_store WHERE id = p_receiver_wallet_id), p_receiver_wallet_id, p_currency, p_amount, 'transfer_in', v_tx_id);

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. ENSURE withdraw_funds IS ALSO CLEAN
DROP FUNCTION IF EXISTS public.withdraw_funds(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC, UUID, JSONB);
-- Re-install most recent (v077)
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
    v_txn_ref TEXT;
BEGIN
    v_txn_ref := 'TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::text FROM 1 FOR 8));
    SELECT user_id, available_balance INTO v_user_id, v_available FROM public.wallets_store WHERE id = p_wallet_id FOR UPDATE;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
    
    SELECT (value#>>'{}')::NUMERIC INTO v_min_withdraw FROM public.admin_settings WHERE key = 'min_withdrawal_amount';
    IF p_amount < v_min_withdraw THEN
        RAISE EXCEPTION 'MINIMUM_WITHDRAWAL_NOT_MET (Min: %, Req: %)', v_min_withdraw, p_amount;
    END IF;

    SELECT two_factor_enabled INTO v_2fa_req FROM public.profiles WHERE id = v_user_id;
    IF v_2fa_req AND NOT p_2fa_verified THEN
        INSERT INTO public.security_audit_logs (user_id, event_type, severity, description)
        VALUES (v_user_id, 'WITHDRAW_2FA_FAIL', 'WARN', 'Withdrawal attempted without 2FA verification');
        RAISE EXCEPTION '2FA_REQUIRED';
    END IF;

    v_limit := public.get_user_withdrawal_limit(v_user_id);
    v_current_total := public.get_daily_withdrawal_total(v_user_id, p_currency);
    IF (v_current_total + p_amount) > v_limit THEN RAISE EXCEPTION 'DAILY_LIMIT_EXCEEDED'; END IF;

    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;

    UPDATE public.wallets_store SET available_balance = available_balance - (p_amount + p_fee), updated_at = NOW() WHERE id = p_wallet_id;

    INSERT INTO public.transactions (user_id, wallet_id, type, from_currency, to_currency, amount_from, amount_to, status, fee, rate, display_label, category, provider, idempotency_key, metadata, created_at, txn_reference)
    VALUES (v_user_id, p_wallet_id, 'withdrawal', p_currency, p_currency, p_amount, p_amount, 'PENDING', p_fee, p_rate, 'Withdrawal Request', 'withdrawal', 'internal', p_idempotency_key, p_metadata, NOW(), v_txn_ref)
    RETURNING id INTO v_tx_id;

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status)
    VALUES (v_user_id, p_wallet_id, p_currency, -(p_amount + p_fee), 'withdrawal', v_tx_id, 'pending');

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
