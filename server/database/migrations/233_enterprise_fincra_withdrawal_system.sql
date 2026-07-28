-- =============================================================================
-- Migration 233: Enterprise Fincra Withdrawal Infrastructure
-- =============================================================================
-- Features:
--   1. Configuration-driven system settings (withdrawal_system_config)
--   2. Retry Queue & Dead Letter Queue (withdrawal_retry_queue, withdrawal_dlq)
--   3. Merchant Balance Logs (fincra_merchant_balance_logs)
--   4. Versioned Bank Directory Cache (fincra_bank_cache)
--   5. Enhanced fincra_transactions columns (references, trace_id, fees, risk, correlation_id)
--   6. Atomic PL/pgSQL RPCs for row-locked wallet debits & reversals
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- TABLE 1: withdrawal_system_config (Dynamic Operational Rules)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_system_config (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key               VARCHAR(128) NOT NULL UNIQUE,
    value             JSONB NOT NULL DEFAULT '{}'::jsonb,
    description       TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default config entries if not present
INSERT INTO public.withdrawal_system_config (key, value, description)
VALUES 
    ('approval_thresholds', '{"auto_limit": 100000, "otp_limit": 500000, "single_admin_limit": 1000000, "dual_admin_limit": 5000000}'::jsonb, 'Multi-tier approval thresholds'),
    ('feature_flags', '{"ENABLE_FINCRA_V2": true, "ENABLE_PROVIDER_FAILOVER": true, "ENABLE_CIRCUIT_BREAKER": true, "ENABLE_RISK_ENGINE": true}'::jsonb, 'System feature flags'),
    ('retry_policy', '{"max_attempts": 5, "initial_backoff_sec": 30, "backoff_multiplier": 2.0}'::jsonb, 'Payout retry policy')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- TABLE 2: fincra_bank_cache (Bank Directory Cache)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fincra_bank_cache (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country           VARCHAR(10) NOT NULL DEFAULT 'NG',
    currency          VARCHAR(10) NOT NULL DEFAULT 'NGN',
    bank_code         VARCHAR(32) NOT NULL,
    bank_name         VARCHAR(255) NOT NULL,
    is_active         BOOLEAN DEFAULT true,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fincra_bank UNIQUE(country, currency, bank_code)
);

-- ---------------------------------------------------------------------------
-- TABLE 3: withdrawal_retry_queue (Exponential Backoff Queue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_retry_queue (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    withdrawal_ref    VARCHAR(128) NOT NULL UNIQUE,
    payload           JSONB NOT NULL,
    attempts          INTEGER NOT NULL DEFAULT 0,
    max_attempts      INTEGER NOT NULL DEFAULT 5,
    next_retry_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error        TEXT,
    status            VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_next ON public.withdrawal_retry_queue(next_retry_at) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- TABLE 4: withdrawal_dlq (Dead Letter Queue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_dlq (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    withdrawal_ref    VARCHAR(128) NOT NULL UNIQUE,
    payload           JSONB NOT NULL,
    failure_reason    TEXT NOT NULL,
    total_attempts    INTEGER NOT NULL,
    resolved          BOOLEAN NOT NULL DEFAULT false,
    resolved_by       UUID REFERENCES auth.users(id),
    resolution_notes  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- TABLE 5: fincra_merchant_balance_logs (Merchant Balance Monitoring)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fincra_merchant_balance_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency          VARCHAR(10) NOT NULL,
    balance           NUMERIC(20, 8) NOT NULL,
    available_balance NUMERIC(20, 8) NOT NULL,
    low_balance_alert BOOLEAN NOT NULL DEFAULT false,
    checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- EXTEND: fincra_transactions Table
-- ---------------------------------------------------------------------------
ALTER TABLE public.fincra_transactions
    ADD COLUMN IF NOT EXISTS withdrawal_reference VARCHAR(128),
    ADD COLUMN IF NOT EXISTS wallet_reference     VARCHAR(128),
    ADD COLUMN IF NOT EXISTS ledger_reference     VARCHAR(128),
    ADD COLUMN IF NOT EXISTS idempotency_key     VARCHAR(128),
    ADD COLUMN IF NOT EXISTS trace_id            VARCHAR(128),
    ADD COLUMN IF NOT EXISTS correlation_id     VARCHAR(128),
    ADD COLUMN IF NOT EXISTS gross_amount        NUMERIC(20, 8),
    ADD COLUMN IF NOT EXISTS fee                 NUMERIC(20, 8) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS net_amount          NUMERIC(20, 8),
    ADD COLUMN IF NOT EXISTS risk_score          INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS risk_route          VARCHAR(32) DEFAULT 'AUTO',
    ADD COLUMN IF NOT EXISTS ip_address          VARCHAR(64),
    ADD COLUMN IF NOT EXISTS device_id           VARCHAR(128),
    ADD COLUMN IF NOT EXISTS user_agent          TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fincra_tx_idempotency ON public.fincra_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fincra_tx_withdrawal_ref ON public.fincra_transactions(withdrawal_reference) WHERE withdrawal_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fincra_tx_trace_id ON public.fincra_transactions(trace_id) WHERE trace_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RPC 1: execute_enterprise_withdrawal
-- Performs atomic row lock on wallets_store, checks daily limit & balance, debits wallet
-- ---------------------------------------------------------------------------
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
-- Finalizes payout on success or failure from provider or webhook
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
