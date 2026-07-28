-- =============================================================================
-- Migration 245: Fix Enterprise Withdrawal RPC Schema & Smart Fee Deduction
-- =============================================================================

BEGIN;

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
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_NOT_FOUND', 'message', 'User wallet not found');
    END IF;

    v_available := GREATEST(0, COALESCE(v_wallet.available_balance, v_wallet.balance, 0));

    -- Smart Fee Adjustment: If balance covers amount but not amount + fee, deduct fee from amount
    IF v_available < v_total_deduction THEN
        IF v_available >= p_amount AND p_amount > v_fee THEN
            v_total_deduction := p_amount;
            v_net_amount := p_amount - v_fee;
        ELSE
            RETURN jsonb_build_object(
                'success', false, 
                'error_code', 'INSUFFICIENT_BALANCE', 
                'message', format('Insufficient wallet balance (%s %s) for requested withdrawal of %s %s', v_available, UPPER(p_currency), p_amount, UPPER(p_currency))
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

    -- 4. Perform Balance Mutation on wallets_store
    UPDATE public.wallets_store
    SET balance = balance - v_total_deduction,
        available_balance = GREATEST(0, available_balance - v_total_deduction),
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

-- ---------------------------------------------------------------------------
-- RPC 2: finalize_enterprise_withdrawal
-- ---------------------------------------------------------------------------
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

    IF UPPER(p_status) = 'SUCCESSFUL' THEN
        UPDATE public.fincra_transactions
        SET status = 'SUCCESSFUL',
            fincra_reference = COALESCE(p_fincra_ref, fincra_reference),
            updated_at = NOW()
        WHERE id = v_tx.id;

        INSERT INTO public.fincra_audit_logs (action, user_id, details)
        VALUES ('WITHDRAWAL_SETTLED', v_tx.user_id, jsonb_build_object('reference', p_withdrawal_ref, 'fincra_ref', p_fincra_ref));

        RETURN jsonb_build_object('success', true, 'status', 'SUCCESSFUL');
    ELSE
        -- Reversal Path: Restore user wallet balance in wallets_store
        SELECT id, balance INTO v_wallet
        FROM public.wallets_store
        WHERE user_id = v_tx.user_id AND currency = v_tx.currency
        FOR UPDATE;

        IF v_wallet.id IS NOT NULL THEN
            UPDATE public.wallets_store
            SET balance = balance + v_tx.gross_amount,
                available_balance = available_balance + v_tx.gross_amount,
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

COMMIT;
