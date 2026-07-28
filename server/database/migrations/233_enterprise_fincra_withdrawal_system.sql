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

-- Seed Default Configuration
INSERT INTO public.withdrawal_system_config (key, value, description)
VALUES 
    ('limits', '{"daily_ngn": 5000000, "monthly_ngn": 50000000, "min_ngn": 100, "max_single_ngn": 2000000}'::jsonb, 'Currency transaction limits'),
    ('approval_thresholds', '{"auto_limit": 100000, "otp_limit": 500000, "single_admin_limit": 1000000, "dual_admin_limit": 5000000}'::jsonb, 'Multi-tier approval thresholds'),
    ('fee_rules', '{"type": "PERCENTAGE_WITH_CAP", "percentage": 0.5, "min_fee": 50, "max_fee": 1000}'::jsonb, 'Withdrawal fee calculation rules'),
    ('risk_thresholds', '{"safe_max": 25, "review_max": 50, "manual_review_max": 75}'::jsonb, 'Fraud scoring routes'),
    ('circuit_breaker', '{"failure_threshold": 5, "cool_off_seconds": 60, "latency_threshold_ms": 5000}'::jsonb, 'Circuit breaker failure parameters'),
    ('retry_config', '{"max_retries": 5, "initial_delay_seconds": 60, "backoff_multiplier": 2}'::jsonb, 'Exponential retry configuration'),
    ('feature_flags', '{"ENABLE_FINCRA_V2": true, "ENABLE_PROVIDER_FAILOVER": true, "ENABLE_MANUAL_REVIEW": true, "ENABLE_RISK_ENGINE": true, "ENABLE_RECEIPTS": true}'::jsonb, 'Operational feature toggles')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- TABLE 2: fincra_bank_cache (Versioned Bank List Directory)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fincra_bank_cache (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version           INTEGER NOT NULL DEFAULT 1,
    country           VARCHAR(10) NOT NULL DEFAULT 'NG',
    currency          VARCHAR(10) NOT NULL DEFAULT 'NGN',
    bank_data         JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    refreshed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fincra_bank_country_currency ON public.fincra_bank_cache(country, currency, is_active);

-- ---------------------------------------------------------------------------
-- TABLE 3: withdrawal_retry_queue (Transient Exponential Backoff Retry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_retry_queue (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_reference VARCHAR(128) NOT NULL UNIQUE,
    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    retry_count           INTEGER NOT NULL DEFAULT 0,
    max_retries           INTEGER NOT NULL DEFAULT 5,
    last_error            TEXT,
    next_retry_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status                VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'EXHAUSTED')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_retry_queue_status_next ON public.withdrawal_retry_queue(status, next_retry_at);

-- ---------------------------------------------------------------------------
-- TABLE 4: withdrawal_dlq (Dead Letter Queue for Manual Review)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_dlq (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_reference VARCHAR(128) NOT NULL UNIQUE,
    user_id               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    failure_reason        TEXT,
    total_retries         INTEGER NOT NULL,
    resolved              BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolution_notes      TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_dlq_resolved ON public.withdrawal_dlq(resolved, created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE 5: fincra_merchant_balance_logs (Auto-Sync Snapshot Audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fincra_merchant_balance_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency          VARCHAR(10) NOT NULL,
    available_balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
    pending_balance   NUMERIC(20, 8) NOT NULL DEFAULT 0,
    raw_response      JSONB DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_bal_created_at ON public.fincra_merchant_balance_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- ENHANCE: fincra_transactions (Add Enterprise Traceability Columns)
-- ---------------------------------------------------------------------------
ALTER TABLE public.fincra_transactions
    ADD COLUMN IF NOT EXISTS withdrawal_reference VARCHAR(128),
    ADD COLUMN IF NOT EXISTS wallet_reference     VARCHAR(128),
    ADD COLUMN IF NOT EXISTS ledger_reference     VARCHAR(128),
    ADD COLUMN IF NOT EXISTS idempotency_key      VARCHAR(128),
    ADD COLUMN IF NOT EXISTS trace_id             VARCHAR(128),
    ADD COLUMN IF NOT EXISTS correlation_id       VARCHAR(128),
    ADD COLUMN IF NOT EXISTS provider_name        VARCHAR(64) DEFAULT 'fincra',
    ADD COLUMN IF NOT EXISTS bank_code            VARCHAR(32),
    ADD COLUMN IF NOT EXISTS account_number_masked VARCHAR(32),
    ADD COLUMN IF NOT EXISTS account_name          VARCHAR(128),
    ADD COLUMN IF NOT EXISTS narration            VARCHAR(256),
    ADD COLUMN IF NOT EXISTS gross_amount         NUMERIC(20, 8) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fee                  NUMERIC(20, 8) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS net_amount           NUMERIC(20, 8) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ip_address           VARCHAR(64),
    ADD COLUMN IF NOT EXISTS device_id            VARCHAR(128),
    ADD COLUMN IF NOT EXISTS user_agent           TEXT,
    ADD COLUMN IF NOT EXISTS risk_score           INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS risk_route           VARCHAR(32) DEFAULT 'AUTO',
    ADD COLUMN IF NOT EXISTS retry_count          INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_retry_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS latency_ms           INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS error_code           VARCHAR(64),
    ADD COLUMN IF NOT EXISTS error_message        TEXT;

CREATE INDEX IF NOT EXISTS idx_fincra_txn_withdrawal_ref ON public.fincra_transactions(withdrawal_reference);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_idempotency_key ON public.fincra_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_correlation_id ON public.fincra_transactions(correlation_id);

-- ---------------------------------------------------------------------------
-- RPC 1: execute_enterprise_withdrawal
-- Row-locked atomic wallet debit to pending_balance, transaction & audit creation
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
    v_total_deduction NUMERIC(20, 8);
    v_net_amount NUMERIC(20, 8);
    v_daily_sum NUMERIC(20, 8);
    v_existing_tx RECORD;
    v_new_tx_id UUID;
    v_daily_limit NUMERIC(20, 8) := 5000000;
BEGIN
    v_total_deduction := p_amount + COALESCE(p_fee, 0);
    v_net_amount := p_amount;

    -- 1. Idempotency Guard: Check if idempotency key already processed
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

    -- 2. Atomic Row Lock on User Wallet
    SELECT id, balance, pending_balance, currency
    INTO v_wallet
    FROM public.wallets_v6
    WHERE user_id = p_user_id AND currency = UPPER(p_currency)
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_NOT_FOUND', 'message', 'User wallet not found');
    END IF;

    IF COALESCE(v_wallet.balance, 0) < v_total_deduction THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_BALANCE', 'message', 'Insufficient wallet balance for withdrawal and fee');
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

    -- 4. Perform Balance Mutation: Available balance -> Pending balance
    UPDATE public.wallets_store
    SET balance = balance - v_total_deduction,
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
        v_net_amount, v_total_deduction, p_fee, v_net_amount, 
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
            'fee', p_fee,
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
        -- Reversal Path: Restore user wallet balance
        SELECT id, balance INTO v_wallet
        FROM public.wallets_v6
        WHERE user_id = v_tx.user_id AND currency = v_tx.currency
        FOR UPDATE;

        IF v_wallet.id IS NOT NULL THEN
            UPDATE public.wallets_store
            SET balance = balance + v_tx.gross_amount,
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
