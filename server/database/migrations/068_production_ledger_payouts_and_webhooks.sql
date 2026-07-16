-- ============================================================================
-- Migration 068: PRODUCTION-GRADE LEDGER PURITY & WEBHOOK AUDITING
-- ============================================================================
-- Purpose:
--   1. Transition to "Pure Ledger" RPCs (no manual wallet balance updates).
--   2. Implement robust Webhook Logging for audit trails.
--   3. Secure Payout workflow with status-based ledger triggers.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. WEBHOOK LOGGING (For Coinbase/Paystack/NowPayments Auditing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider          TEXT NOT NULL,
    reference         TEXT, -- Extract key reference if possible
    payload           JSONB NOT NULL,
    headers           JSONB,
    ip_address        TEXT,
    processed         BOOLEAN DEFAULT false,
    processing_error  TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON public.webhook_logs(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_ref      ON public.webhook_logs(reference);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created  ON public.webhook_logs(created_at DESC);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
-- Only admins can view webhook logs
CREATE POLICY "Admins can view webhook logs" ON public.webhook_logs
    FOR SELECT USING (is_admin(auth.uid()));


-- ============================================================================
-- 2. REFACTOR RPCs TO BE "LEDGER-PURE"
--    We remove manual UPDATE wallets and rely on Migration 067 Triggers.
-- ============================================================================

-- A. TRANSFER FUNDS
CREATE OR REPLACE FUNCTION public.transfer_funds(
    p_sender_wallet_id   UUID,
    p_receiver_wallet_id UUID,
    p_amount             NUMERIC,
    p_currency           VARCHAR,
    p_fee                NUMERIC DEFAULT 0,
    p_rate               NUMERIC DEFAULT 1,
    p_platform_wallet_id UUID DEFAULT NULL,
    p_metadata           JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
    v_sender_user_id UUID;
    v_receiver_user_id UUID;
BEGIN
    -- Validation (Triggers will also catch this via CHECK constraints)
    IF (SELECT available_balance FROM wallets WHERE id = p_sender_wallet_id) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;

    SELECT user_id INTO v_sender_user_id FROM wallets WHERE id = p_sender_wallet_id;
    SELECT user_id INTO v_receiver_user_id FROM wallets WHERE id = p_receiver_wallet_id;

    v_ref_id := uuid_generate_v4();

    -- Record Transactions ONLY. Trigger handles balance logic.
    -- Sender Debit
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        sender_wallet_id, receiver_wallet_id, counterparty_id,
        provider, metadata, completed_at
    ) VALUES (
        p_sender_wallet_id, v_sender_user_id, 'TRANSFER_OUT', 'Transfer Sent', 'transfer',
        p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee,
        p_sender_wallet_id, p_receiver_wallet_id, v_receiver_user_id,
        'internal', p_metadata, NOW()
    ) RETURNING id INTO v_tx_id;

    -- Receiver Credit
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        sender_wallet_id, receiver_wallet_id, counterparty_id,
        provider, metadata, completed_at
    ) VALUES (
        p_receiver_wallet_id, v_receiver_user_id, 'TRANSFER_IN', 'Transfer Received', 'transfer',
        p_amount, p_currency, 'COMPLETED', v_ref_id, 0,
        p_sender_wallet_id, p_receiver_wallet_id, v_sender_user_id,
        'internal', p_metadata, NOW()
    );

    -- Platform Fee (if applicable)
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        INSERT INTO public.transactions (
            wallet_id, user_id, type, display_label, category,
            amount, currency, status, reference_id, provider, completed_at
        ) VALUES (
            p_platform_wallet_id, (SELECT user_id FROM wallets WHERE id = p_platform_wallet_id), 
            'SYSTEM_CREDIT', 'Transfer Fee', 'revenue',
            p_fee, p_currency, 'COMPLETED', v_ref_id, 'system', NOW()
        );
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- B. EXECUTE SWAP (Refactored for Ledger Purity)
CREATE OR REPLACE FUNCTION public.execute_swap_atomic(
    p_user_id        UUID,
    p_from_wallet_id UUID,
    p_to_wallet_id   UUID,
    p_from_amount    NUMERIC,
    p_to_amount      NUMERIC,
    p_from_currency  TEXT,
    p_to_currency    TEXT,
    p_exchange_rate   NUMERIC,
    p_spread_amount  NUMERIC DEFAULT 0,
    p_fee            NUMERIC DEFAULT 0,
    p_platform_wallet_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_metadata       JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
    v_final_metadata JSONB;
BEGIN
    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN
            RETURN v_tx_id;
        END IF;
    END IF;

    -- Validation
    IF (SELECT available_balance FROM wallets WHERE id = p_from_wallet_id) < (p_from_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds for swap';
    END IF;

    v_ref_id := uuid_generate_v4();
    v_final_metadata := p_metadata || jsonb_build_object(
        'category', 'swap',
        'from_currency', p_from_currency,
        'to_currency', p_to_currency,
        'exchange_rate', p_exchange_rate,
        'spread_amount', p_spread_amount
    );

    -- record SELL side
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        exchange_rate, spread_amount, market_price, final_price,
        internal_coin, internal_amount,
        provider, idempotency_key, metadata, completed_at,
        transaction_fee_breakdown
    ) VALUES (
        p_from_wallet_id, p_user_id, 'SWAP_OUT', 'Swap Sold', 'swap',
        p_from_amount, p_from_currency, 'COMPLETED', v_ref_id, p_fee,
        p_exchange_rate, p_spread_amount, p_exchange_rate, p_exchange_rate,
        p_to_currency, p_to_amount,
        'internal', p_idempotency_key, v_final_metadata, NOW(),
        jsonb_build_object('swap_fee', p_fee, 'spread', p_spread_amount)
    ) RETURNING id INTO v_tx_id;

    -- Record BUY side
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        exchange_rate, internal_coin, internal_amount,
        provider, metadata, completed_at
    ) VALUES (
        p_to_wallet_id, p_user_id, 'SWAP_IN', 'Swap Bought', 'swap',
        p_to_amount, p_to_currency, 'COMPLETED', v_ref_id, 0,
        p_exchange_rate, p_from_currency, p_from_amount,
        'internal', v_final_metadata, NOW()
    );

    -- Platform Revenue
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        INSERT INTO public.transactions (
            wallet_id, user_id, type, display_label, category,
            amount, currency, status, reference_id, provider, completed_at
        ) VALUES (
            p_platform_wallet_id, (SELECT user_id FROM wallets WHERE id = p_platform_wallet_id), 
            'SYSTEM_CREDIT', 'Swap Fee', 'revenue',
            p_fee, p_from_currency, 'COMPLETED', v_ref_id, 'system', NOW()
        );
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- C. CONFIRM DEPOSIT (Refactored for Ledger Purity)
CREATE OR REPLACE FUNCTION public.confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id      UUID,
    p_amount         NUMERIC,
    p_external_hash  TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- We ONLY update the transaction. The Migration 067 trigger will recalculate the wallet balance.
    UPDATE public.transactions
    SET status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_transaction_id
      AND status = 'PENDING';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- D. CREDIT WALLET ATOMIC (Refactored for Ledger Purity)
-- Previously this updated the wallet directly. Now it creates a transaction record.
CREATE OR REPLACE FUNCTION public.credit_wallet_atomic(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_currency TEXT;
BEGIN
    SELECT user_id, currency INTO v_user_id, v_currency FROM wallets WHERE id = p_wallet_id;
    
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, provider, completed_at
    ) VALUES (
        p_wallet_id, v_user_id, 'DEPOSIT', 'System Credit', 'adjustment',
        p_amount, v_currency, 'COMPLETED', 'system', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- E. WITHDRAW FUNDS (Initial Request)
CREATE OR REPLACE FUNCTION public.withdraw_funds(
    p_wallet_id          UUID,
    p_amount             NUMERIC,
    p_currency           TEXT,
    p_fee                NUMERIC,
    p_rate               NUMERIC,
    p_platform_wallet_id UUID,
    p_metadata           JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_user_id UUID;
BEGIN
    IF (SELECT available_balance FROM wallets WHERE id = p_wallet_id) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;

    SELECT user_id INTO v_user_id FROM wallets WHERE id = p_wallet_id;

    -- Insert PENDING transaction. 
    -- Ledger Trigger will automatically reduce `available_balance` while status is PENDING.
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        exchange_rate, provider, metadata, 
        transaction_fee_breakdown
    ) VALUES (
        p_wallet_id, v_user_id, 'WITHDRAWAL', 'Withdrawal', 'withdrawal',
        p_amount, p_currency, 'PENDING', uuid_generate_v4(), p_fee,
        p_rate, 'internal', p_metadata,
        jsonb_build_object('withdrawal_fee', p_fee)
    ) RETURNING id INTO v_tx_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- C. REQUEST PAYOUT (Harden workflow)
CREATE OR REPLACE FUNCTION public.request_payout(
    p_user_id       UUID,
    p_wallet_id     UUID,
    p_amount        NUMERIC,
    p_currency      TEXT,
    p_fee           NUMERIC,
    p_payout_method TEXT,
    p_destination   JSONB,
    p_metadata      JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_payout_id UUID;
    v_tx_id UUID;
BEGIN
    IF (SELECT available_balance FROM wallets WHERE id = p_wallet_id) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Create PENDING transaction. Trigger handles available_balance.
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, fee, provider, metadata
    ) VALUES (
        p_wallet_id, p_user_id, 'PAYOUT', 'Payout Request', 'payout',
        p_amount, p_currency, 'PENDING', p_fee, 'manual', p_metadata
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.payout_requests (
        user_id, wallet_id, transaction_id,
        amount, fee, net_amount, currency,
        payout_method, destination, metadata, status
    ) VALUES (
        p_user_id, p_wallet_id, v_tx_id,
        p_amount, p_fee, p_amount - p_fee, p_currency,
        p_payout_method, p_destination, p_metadata, 'pending_review'
    ) RETURNING id INTO v_payout_id;

    RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- D. APPROVE PAYOUT
CREATE OR REPLACE FUNCTION public.approve_payout(
    p_payout_id  UUID,
    p_admin_id   UUID,
    p_note       TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_tx_id UUID;
    v_fee NUMERIC;
    v_currency TEXT;
    v_wallet_id UUID;
    v_plat_wallet_id UUID;
BEGIN
    -- 1. Get transaction info
    SELECT transaction_id, fee, currency, wallet_id 
    INTO v_tx_id, v_fee, v_currency, v_wallet_id
    FROM payout_requests WHERE id = p_payout_id FOR UPDATE;

    -- 2. Update Transaction to COMPLETED.
    -- Ledger Trigger will now subtract from `balance` (not just available).
    UPDATE public.transactions 
    SET status = 'COMPLETED', 
        completed_at = NOW() 
    WHERE id = v_tx_id;

    -- 3. Update Payout Request
    UPDATE public.payout_requests
    SET status = 'approved',
        reviewed_by = p_admin_id,
        reviewed_at = NOW(),
        review_note = p_note
    WHERE id = p_payout_id;

    -- 4. Credit Platform Fee (if exists)
    IF v_fee > 0 THEN
        -- Find platform wallet for this currency
        SELECT id INTO v_plat_wallet_id FROM wallets 
        WHERE user_id IN (SELECT id FROM profiles WHERE role = 'admin') 
          AND currency = v_currency LIMIT 1;

        IF v_plat_wallet_id IS NOT NULL THEN
            INSERT INTO public.transactions (
                wallet_id, user_id, type, display_label, category,
                amount, currency, status, provider, completed_at
            ) VALUES (
                v_plat_wallet_id, (SELECT user_id FROM wallets WHERE id = v_plat_wallet_id), 
                'SYSTEM_CREDIT', 'Payout Fee', 'revenue',
                v_fee, v_currency, 'COMPLETED', 'system', NOW()
            );
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. FINAL INTEGRITY SWEEP
-- ============================================================================

-- Backfill any missing platform wallets to ensure revenue goes somewhere
DO $$
DECLARE
    v_admin_id UUID;
    v_curr TEXT;
BEGIN
    SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NULL THEN RETURN; END IF;

    FOR v_curr IN SELECT DISTINCT currency FROM wallets LOOP
        IF NOT EXISTS (SELECT 1 FROM wallets WHERE user_id = v_admin_id AND currency = v_curr) THEN
            INSERT INTO wallets (user_id, currency, balance, available_balance, address)
            VALUES (v_admin_id, v_curr, 0, 0, 'PLATFORM_' || v_curr);
        END IF;
    END LOOP;
END $$;

COMMIT;
