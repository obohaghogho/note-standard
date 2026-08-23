-- Migration: 407_atomic_withdrawal_settlement_rpc.sql
-- Purpose: Ensures 100% database-level transaction atomicity for withdrawal finalization and reversal.
-- Eliminates Node process crash window between wallet balance mutation and transaction status update.

-- 1. Atomic Finalize Settlement for Fincra / IdempotentWithdrawalSettlementService
CREATE OR REPLACE FUNCTION public.atomic_finalize_withdrawal_settlement(
    p_transaction_id UUID,
    p_wallet_id      UUID,
    p_amount         NUMERIC,
    p_provider_ref   VARCHAR DEFAULT NULL,
    p_source         VARCHAR DEFAULT 'SYSTEM',
    p_admin_id       VARCHAR DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tx RECORD;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- 1. Lock transaction row FOR UPDATE
    SELECT * INTO v_tx
    FROM public.fincra_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;

    -- 2. Idempotency Check
    IF v_tx.funds_status = 'DEBITED' OR v_tx.withdrawal_status = 'COMPLETED' OR v_tx.status = 'SUCCESSFUL' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_debited', true,
            'debited', false,
            'transaction_id', v_tx.id
        );
    END IF;

    -- 3. Execute Balance Debit on wallets_store
    UPDATE public.wallets_store
    SET balance          = balance - p_amount,
        reserved_balance = GREATEST(0, COALESCE(reserved_balance, 0) - p_amount),
        updated_at       = v_now
    WHERE id = p_wallet_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'atomic_finalize_withdrawal_settlement: wallet % not found', p_wallet_id;
    END IF;

    -- 4. Multi-State Transaction Update
    UPDATE public.fincra_transactions
    SET status                = 'SUCCESSFUL',
        withdrawal_status    = 'COMPLETED',
        funds_status         = 'DEBITED',
        provider_status      = 'SUCCESS',
        reconciliation_status = CASE WHEN p_source LIKE '%ADMIN%' OR p_source LIKE '%RECONCILIATION%' THEN 'RECONCILED' ELSE 'NONE' END,
        fincra_reference     = COALESCE(p_provider_ref, fincra_reference, reference),
        reconciled_at        = v_now,
        reconciled_by        = COALESCE(p_admin_id, p_source),
        updated_at           = v_now
    WHERE id = p_transaction_id;

    -- 5. Audit Log
    INSERT INTO public.banking_audit_logs (user_id, admin_id, action, provider, previous_values, new_values, correlation_id)
    VALUES (
        v_tx.user_id,
        p_admin_id,
        'WITHDRAWAL_SETTLED_FINAL',
        COALESCE(v_tx.provider_name, 'fincra'),
        jsonb_build_object('withdrawal_status', v_tx.withdrawal_status, 'funds_status', v_tx.funds_status),
        jsonb_build_object('withdrawal_status', 'COMPLETED', 'funds_status', 'DEBITED', 'provider_status', 'SUCCESS', 'debited_amount', p_amount, 'source', p_source),
        COALESCE(v_tx.correlation_id, format('CORR_%s', EXTRACT(EPOCH FROM NOW())))
    );

    RETURN jsonb_build_object(
        'success', true,
        'debited', true,
        'already_debited', false,
        'transaction_id', v_tx.id,
        'status', 'COMPLETED'
    );
END;
$$;

-- 2. Atomic Reverse Reservation for Fincra / IdempotentWithdrawalSettlementService
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
    -- 1. Lock transaction row FOR UPDATE
    SELECT * INTO v_tx
    FROM public.fincra_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;

    -- 2. Idempotency Check
    IF v_tx.funds_status = 'RELEASED' OR v_tx.withdrawal_status = 'REVERSED' OR v_tx.status = 'REVERSED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_released', true,
            'released', false,
            'transaction_id', v_tx.id
        );
    END IF;

    -- 3. Execute Balance Restoration on wallets_store
    UPDATE public.wallets_store
    SET available_balance = available_balance + p_amount,
        reserved_balance  = GREATEST(0, COALESCE(reserved_balance, 0) - p_amount),
        updated_at        = v_now
    WHERE id = p_wallet_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'atomic_reverse_withdrawal_reservation: wallet % not found', p_wallet_id;
    END IF;

    -- 4. Multi-State Transaction Update
    UPDATE public.fincra_transactions
    SET status            = 'REVERSED',
        withdrawal_status = 'REVERSED',
        funds_status      = 'RELEASED',
        provider_status   = 'FAILED',
        error_code        = p_error_code,
        error_message     = p_reason,
        reconciled_at     = v_now,
        reconciled_by     = COALESCE(p_admin_id, p_source),
        updated_at        = v_now
    WHERE id = p_transaction_id;

    -- 5. Audit Log
    INSERT INTO public.banking_audit_logs (user_id, admin_id, action, provider, previous_values, new_values, correlation_id)
    VALUES (
        v_tx.user_id,
        p_admin_id,
        'WITHDRAWAL_RESERVATION_REVERSED',
        COALESCE(v_tx.provider_name, 'fincra'),
        jsonb_build_object('withdrawal_status', v_tx.withdrawal_status, 'funds_status', v_tx.funds_status),
        jsonb_build_object('withdrawal_status', 'REVERSED', 'funds_status', 'RELEASED', 'provider_status', 'FAILED', 'restored_amount', p_amount, 'reason', p_reason, 'source', p_source),
        COALESCE(v_tx.correlation_id, format('CORR_%s', EXTRACT(EPOCH FROM NOW())))
    );

    RETURN jsonb_build_object(
        'success', true,
        'released', true,
        'already_released', false,
        'transaction_id', v_tx.id,
        'status', 'REVERSED'
    );
END;
$$;

-- 3. Atomic Rollback for WithdrawalWorkflowService (transactions table)
CREATE OR REPLACE FUNCTION public.atomic_rollback_transaction(
    p_transaction_id UUID,
    p_reason         TEXT,
    p_fail_state     VARCHAR DEFAULT 'REJECTED'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tx RECORD;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;

    IF v_tx.status IN ('COMPLETED', 'RECONCILED', 'CANCELLED', 'REJECTED', 'REVERSED') THEN
        RETURN jsonb_build_object('success', true, 'already_finalized', true, 'status', v_tx.status);
    END IF;

    -- Update Transaction Status
    UPDATE public.transactions
    SET status   = p_fail_state,
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{failure_reason}', to_jsonb(p_reason),
            true
        )
    WHERE id = p_transaction_id;

    -- Restore Wallet Available Balance
    IF v_tx.wallet_id IS NOT NULL AND v_tx.amount > 0 THEN
        UPDATE public.wallets_store
        SET available_balance = available_balance + v_tx.amount,
            updated_at        = v_now
        WHERE id = v_tx.wallet_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', p_fail_state, 'restored_amount', v_tx.amount);
END;
$$;

-- 4. Atomic Finalize for WithdrawalWorkflowService (transactions table)
CREATE OR REPLACE FUNCTION public.atomic_finalize_transaction(
    p_transaction_id UUID,
    p_provider_ref   VARCHAR DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tx RECORD;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;

    IF v_tx.status IN ('COMPLETED', 'RECONCILED') THEN
        RETURN jsonb_build_object('success', true, 'already_finalized', true, 'status', v_tx.status);
    END IF;

    -- Update Transaction Status
    UPDATE public.transactions
    SET status             = 'COMPLETED',
        provider_reference = COALESCE(p_provider_ref, provider_reference),
        updated_at         = v_now
    WHERE id = p_transaction_id;

    -- Deduct Balance
    IF v_tx.wallet_id IS NOT NULL AND v_tx.amount > 0 THEN
        UPDATE public.wallets_store
        SET balance    = GREATEST(0, balance - v_tx.amount),
            updated_at = v_now
        WHERE id = v_tx.wallet_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'COMPLETED', 'debited_amount', v_tx.amount);
END;
$$;
