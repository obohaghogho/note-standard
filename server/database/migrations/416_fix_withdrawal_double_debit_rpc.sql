-- =============================================================================
-- Migration 416: Fix Withdrawal Double Debit RPC & Align 3-Tier Balance Model
-- =============================================================================
-- Purpose: Resolves the double-debit bug where execute_enterprise_withdrawal
-- deducted balance at initiation AND atomic_finalize_withdrawal_settlement
-- deducted balance again at settlement.
--
-- Lifecycle Rules:
-- 1. Initiation (execute_enterprise_withdrawal):
--    - Deducts available_balance ONLY (reserving funds in reserved_balance).
--    - Leaves balance intact (since funds have not yet left the platform).
--
-- 2. Settlement (atomic_finalize_withdrawal_settlement & finalize_enterprise_withdrawal):
--    - Deducts balance ONLY upon provider confirmation (releasing reserved_balance).
--    - Leaves available_balance intact (it was already reduced during reservation).
--
-- 3. Reversal (atomic_reverse_withdrawal_reservation & finalize_enterprise_withdrawal reversal):
--    - Restores available_balance ONLY (releasing reserved_balance).
--    - Leaves balance intact.
-- =============================================================================

BEGIN;

-- 1. RPC: execute_enterprise_withdrawal (Initiation)
CREATE OR REPLACE FUNCTION public.execute_enterprise_withdrawal(
    p_user_id             UUID,
    p_currency            VARCHAR,
    p_amount              NUMERIC,
    p_fee                 NUMERIC,
    p_withdrawal_ref      VARCHAR,
    p_wallet_ref          VARCHAR,
    p_ledger_ref          VARCHAR,
    p_idempotency_key     VARCHAR,
    p_trace_id            VARCHAR,
    p_correlation_id      VARCHAR,
    p_bank_code           VARCHAR,
    p_account_number_mask VARCHAR,
    p_account_name        VARCHAR,
    p_narration           VARCHAR,
    p_ip_address          VARCHAR,
    p_device_id           VARCHAR,
    p_user_agent          TEXT,
    p_risk_score          INTEGER,
    p_risk_route          VARCHAR,
    p_provider_name       VARCHAR DEFAULT 'fincra'
) RETURNS JSONB AS $$
DECLARE
    v_wallet RECORD;
    v_available NUMERIC(20, 8);
    v_total_deduction NUMERIC(20, 8);
    v_net_amount NUMERIC(20, 8);
    v_fee NUMERIC(20, 8);
    v_daily_sum NUMERIC(20, 8);
    v_existing_tx RECORD;
    v_new_tx_id UUID;
    v_daily_limit NUMERIC(20, 8) := 5000000;
BEGIN
    v_fee := COALESCE(p_fee, 0);
    v_total_deduction := p_amount + v_fee;
    v_net_amount := p_amount;

    -- 1. Idempotency Guard
    SELECT id, reference, status INTO v_existing_tx
    FROM public.fincra_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_tx.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'reference', v_existing_tx.reference,
            'status', v_existing_tx.status
        );
    END IF;

    -- 2. Atomic Row Lock on Base Table public.wallets_store
    SELECT id, balance, available_balance, currency
    INTO v_wallet
    FROM public.wallets_store
    WHERE user_id = p_user_id AND currency = UPPER(p_currency)
    ORDER BY GREATEST(0, COALESCE(available_balance, balance, 0)) DESC, updated_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_NOT_FOUND', 'message', 'User wallet not found');
    END IF;

    v_available := GREATEST(0, COALESCE(v_wallet.available_balance, v_wallet.balance, 0));

    -- Smart Fee Adjustment: If available balance covers amount but not amount + fee, deduct fee from amount
    IF v_available < v_total_deduction THEN
        IF v_available >= p_amount AND p_amount > v_fee THEN
            v_total_deduction := p_amount;
            v_net_amount := p_amount - v_fee;
        ELSE
            RETURN jsonb_build_object(
                'success', false, 
                'error_code', 'INSUFFICIENT_BALANCE', 
                'message', format('Insufficient available wallet balance (%s %s) for requested withdrawal of %s %s', v_available, UPPER(p_currency), p_amount, UPPER(p_currency))
            );
        END IF;
    END IF;

    -- 3. Daily Limit Verification
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_daily_sum
    FROM public.fincra_transactions
    WHERE user_id = p_user_id 
      AND currency = UPPER(p_currency)
      AND type = 'WITHDRAWAL'
      AND status NOT IN ('FAILED', 'REVERSED', 'CANCELLED')
      AND created_at >= (NOW() - INTERVAL '24 hours');

    IF (v_daily_sum + v_total_deduction) > v_daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'DAILY_LIMIT_EXCEEDED', 'message', 'Daily withdrawal limit exceeded');
    END IF;

    -- 4. Perform Reservation Mutation on wallets_store (Deduct available_balance ONLY, balance untouched)
    UPDATE public.wallets_store
    SET available_balance = GREATEST(0, available_balance - v_total_deduction),
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- 5. Insert Transaction Record
    INSERT INTO public.fincra_transactions (
        user_id, reference, withdrawal_reference, wallet_reference, ledger_reference,
        idempotency_key, trace_id, correlation_id, type, currency, amount, gross_amount,
        fee, net_amount, status, provider_name, bank_code, account_number_masked,
        account_name, narration, ip_address, device_id, user_agent, risk_score, risk_route
    ) VALUES (
        p_user_id, p_withdrawal_ref, p_withdrawal_ref, p_wallet_ref, p_ledger_ref,
        p_idempotency_key, p_trace_id, p_correlation_id, 'WITHDRAWAL', UPPER(p_currency),
        v_net_amount, v_total_deduction, v_fee, v_net_amount, 
        CASE WHEN p_risk_route = 'MANUAL_REVIEW' THEN 'MANUAL_REVIEW' ELSE 'RESERVED' END,
        p_provider_name, p_bank_code, p_account_number_mask,
        p_account_name, p_narration, p_ip_address, p_device_id, p_user_agent, p_risk_score, p_risk_route
    ) RETURNING id INTO v_new_tx_id;

    -- 6. Insert Append-Only Audit Log
    INSERT INTO public.fincra_audit_logs (action, user_id, details)
    VALUES (
        'WITHDRAWAL_RESERVED',
        p_user_id,
        jsonb_build_object(
            'transaction_id', v_new_tx_id,
            'withdrawal_reference', p_withdrawal_ref,
            'wallet_reference', p_wallet_ref,
            'gross_amount', v_total_deduction,
            'net_amount', v_net_amount,
            'fee', v_fee,
            'correlation_id', p_correlation_id,
            'risk_score', p_risk_score,
            'risk_route', p_risk_route
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'transaction_id', v_new_tx_id,
        'withdrawal_reference', p_withdrawal_ref,
        'status', CASE WHEN p_risk_route = 'MANUAL_REVIEW' THEN 'MANUAL_REVIEW' ELSE 'RESERVED' END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. RPC: finalize_enterprise_withdrawal (Settlement & Reversal)
CREATE OR REPLACE FUNCTION public.finalize_enterprise_withdrawal(
    p_withdrawal_ref  VARCHAR,
    p_fincra_ref      VARCHAR,
    p_status          VARCHAR,
    p_error_code      VARCHAR DEFAULT NULL,
    p_error_message   TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_tx RECORD;
    v_wallet RECORD;
BEGIN
    SELECT * INTO v_tx
    FROM public.fincra_transactions
    WHERE reference = p_withdrawal_ref OR withdrawal_reference = p_withdrawal_ref
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;

    IF v_tx.status IN ('SUCCESSFUL', 'REVERSED', 'CANCELLED') THEN
        RETURN jsonb_build_object('success', true, 'already_finalized', true, 'status', v_tx.status);
    END IF;

    SELECT id, balance, available_balance INTO v_wallet
    FROM public.wallets_store
    WHERE user_id = v_tx.user_id AND currency = v_tx.currency
    FOR UPDATE;

    IF UPPER(p_status) = 'SUCCESSFUL' THEN
        -- Settlement Path: Deduct balance ONLY (available_balance was already reduced at initiation)
        IF v_wallet.id IS NOT NULL THEN
            UPDATE public.wallets_store
            SET balance = GREATEST(0, balance - v_tx.gross_amount),
                updated_at = NOW()
            WHERE id = v_wallet.id;
        END IF;

        UPDATE public.fincra_transactions
        SET status = 'SUCCESSFUL',
            fincra_reference = COALESCE(p_fincra_ref, fincra_reference),
            updated_at = NOW()
        WHERE id = v_tx.id;

        INSERT INTO public.fincra_audit_logs (action, user_id, details)
        VALUES ('WITHDRAWAL_SETTLED', v_tx.user_id, jsonb_build_object('reference', p_withdrawal_ref, 'fincra_ref', p_fincra_ref));

        RETURN jsonb_build_object('success', true, 'status', 'SUCCESSFUL');
    ELSE
        -- Reversal Path: Restore available_balance ONLY (balance was never deducted)
        IF v_wallet.id IS NOT NULL THEN
            UPDATE public.wallets_store
            SET available_balance = available_balance + v_tx.gross_amount,
                updated_at = NOW()
            WHERE id = v_wallet.id;
        END IF;

        UPDATE public.fincra_transactions
        SET status = 'REVERSED',
            fincra_reference = COALESCE(p_fincra_ref, fincra_reference),
            error_code = p_error_code,
            error_message = p_error_message,
            updated_at = NOW()
        WHERE id = v_tx.id;

        INSERT INTO public.fincra_audit_logs (action, user_id, details)
        VALUES ('WITHDRAWAL_REVERSED', v_tx.user_id, jsonb_build_object(
            'reference', p_withdrawal_ref,
            'restored_amount', v_tx.gross_amount,
            'error_code', p_error_code,
            'error_message', p_error_message
        ));

        RETURN jsonb_build_object('success', true, 'status', 'REVERSED', 'restored_amount', v_tx.gross_amount);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. RPC: atomic_reverse_withdrawal_reservation (Reversal)
CREATE OR REPLACE FUNCTION public.atomic_reverse_withdrawal_reservation(
    p_transaction_id UUID,
    p_wallet_id      UUID,
    p_amount         NUMERIC,
    p_reason         TEXT DEFAULT 'Withdrawal failed',
    p_error_code     VARCHAR DEFAULT 'PROVIDER_FAILED',
    p_source         VARCHAR DEFAULT 'SYSTEM',
    p_admin_id       VARCHAR DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tx RECORD;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    SELECT * INTO v_tx
    FROM public.fincra_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;

    IF v_tx.status IN ('REVERSED', 'CANCELLED', 'FAILED') THEN
        RETURN jsonb_build_object('success', true, 'already_reversed', true, 'status', v_tx.status);
    END IF;

    -- Restore available_balance ONLY (balance was not deducted during reservation)
    UPDATE public.wallets_store
    SET available_balance = available_balance + p_amount,
        updated_at        = v_now
    WHERE id = p_wallet_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'atomic_reverse_withdrawal_reservation: wallet % not found', p_wallet_id;
    END IF;

    UPDATE public.fincra_transactions
    SET status                = 'REVERSED',
        withdrawal_status    = 'REVERSED',
        funds_status         = 'RESTORED',
        provider_status      = 'FAILED',
        error_code           = p_error_code,
        error_message        = p_reason,
        updated_at           = v_now
    WHERE id = p_transaction_id;

    INSERT INTO public.banking_audit_logs (user_id, admin_id, action, provider, previous_values, new_values, correlation_id)
    VALUES (
        v_tx.user_id,
        p_admin_id,
        'WITHDRAWAL_RESERVED_RELEASED',
        COALESCE(v_tx.provider_name, 'fincra'),
        jsonb_build_object('withdrawal_status', v_tx.withdrawal_status, 'funds_status', v_tx.funds_status),
        jsonb_build_object('withdrawal_status', 'REVERSED', 'funds_status', 'RESTORED', 'reason', p_reason, 'restored_amount', p_amount, 'source', p_source),
        COALESCE(v_tx.correlation_id, format('CORR_%s', EXTRACT(EPOCH FROM NOW())))
    );

    RETURN jsonb_build_object(
        'success', true,
        'reversed', true,
        'already_reversed', false,
        'transaction_id', v_tx.id,
        'status', 'REVERSED'
    );
END;
$$;

COMMIT;
