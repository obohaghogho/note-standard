-- ============================================================================
-- Migration 077: UNIQUE TRANSACTION REFERENCES (COMPLIANCE & TRACEABILITY)
-- ============================================================================
-- Purpose:
--   1. Add 'txn_reference' column to transactions table with UNIQUE constraint.
--   2. Implement standard reference format: TXN-YYYY-UUID.
--   3. Refactor all core wallet RPCs to generate and store this reference.
-- ============================================================================

BEGIN;

-- 1. ADD COLUMN & BACKFILL
ALTER TABLE public.transactions 
    ADD COLUMN IF NOT EXISTS txn_reference TEXT;

-- Generate references for existing transactions
UPDATE public.transactions 
SET txn_reference = 'TXN-' || TO_CHAR(created_at, 'YYYY') || '-' || UPPER(SUBSTRING(id::text FROM 1 FOR 8))
WHERE txn_reference IS NULL;

-- Enforce Uniqueness
ALTER TABLE public.transactions 
    ADD CONSTRAINT unique_txn_reference UNIQUE (txn_reference);

CREATE INDEX IF NOT EXISTS idx_transactions_reference_text ON public.transactions(txn_reference);


-- 2. REFACTOR WITHDRAWAL RPC (Add Reference)
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
    -- Generare Reference
    v_txn_ref := 'TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::text FROM 1 FOR 8));

    -- 1. Lock wallet row
    SELECT user_id, available_balance 
    INTO v_user_id, v_available 
    FROM public.wallets_store 
    WHERE id = p_wallet_id 
    FOR UPDATE;
    
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    -- 2. Minimum Withdrawal Check
    SELECT (value#>>'{}')::NUMERIC INTO v_min_withdraw FROM public.admin_settings WHERE key = 'min_withdrawal_amount';
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

    -- 6. Atomic Update Available Balance
    UPDATE public.wallets_store 
    SET available_balance = available_balance - (p_amount + p_fee),
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- 7. Create Transaction (PENDING)
    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency,
        amount_from, amount_to, status, fee, rate,
        display_label, category, provider, idempotency_key, metadata, 
        created_at, txn_reference
    ) VALUES (
        v_user_id, p_wallet_id, 'withdrawal', p_currency, p_currency,
        p_amount, p_amount, 'PENDING', p_fee, p_rate,
        'Withdrawal Request', 'withdrawal', 'internal', p_idempotency_key, p_metadata, 
        NOW(), v_txn_ref
    ) RETURNING id INTO v_tx_id;

    -- 8. Create Ledger Entry (PENDING)
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status)
    VALUES (v_user_id, p_wallet_id, p_currency, -(p_amount + p_fee), 'withdrawal', v_tx_id, 'pending');

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. REFACTOR SWAP RPC (Add Reference)
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
DECLARE v_tx_id UUID; v_avail NUMERIC; v_max_swap NUMERIC; v_txn_ref TEXT;
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

    -- Generate Reference
    v_txn_ref := 'TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::text FROM 1 FOR 8));

    -- 4. Atomic Balance Update
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
        amount_from, amount_to, rate, fee, status, idempotency_key, metadata,
        txn_reference
    ) VALUES (
        p_user_id, p_from_wallet_id, 'swap', p_from_currency, p_to_currency, 
        p_from_amount, p_to_amount, p_rate, p_fee, 'COMPLETED', p_idempotency_key, p_metadata,
        v_txn_ref
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) 
    VALUES (p_user_id, p_from_wallet_id, p_from_currency, -(p_from_amount + p_fee), 'swap_debit', v_tx_id);

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) 
    VALUES (p_user_id, p_to_wallet_id, p_to_currency, p_to_amount, 'swap_credit', v_tx_id);

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. REFACTOR TRANSFER RPC (Add Reference)
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


-- 5. REFACTOR DEPOSIT RPC (Add Reference)
CREATE OR REPLACE FUNCTION public.confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_external_hash TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE v_user_id UUID; v_txn_ref TEXT;
BEGIN
    SELECT user_id INTO v_user_id FROM public.wallets_store WHERE id = p_wallet_id;
    
    -- Lock both
    PERFORM 1 FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
    PERFORM 1 FROM public.wallets_store WHERE id = p_wallet_id FOR UPDATE;

    IF (SELECT status FROM public.transactions WHERE id = p_transaction_id) != 'PENDING' THEN RETURN; END IF;

    -- Generate Reference if it doesn't have one
    SELECT txn_reference INTO v_txn_ref FROM public.transactions WHERE id = p_transaction_id;
    IF v_txn_ref IS NULL THEN
        v_txn_ref := 'TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::text FROM 1 FOR 8));
    END IF;

    -- Update Balance
    UPDATE public.wallets_store SET balance = balance + p_amount, available_balance = available_balance + p_amount, updated_at = NOW() WHERE id = p_wallet_id;

    -- Update Transaction
    UPDATE public.transactions SET status = 'COMPLETED', external_hash = p_external_hash, txn_reference = v_txn_ref, updated_at = NOW() WHERE id = p_transaction_id;

    -- Ledger
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference)
    VALUES (v_user_id, p_wallet_id, (SELECT currency FROM public.wallets_store WHERE id = p_wallet_id), p_amount, 'deposit', p_transaction_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
