-- ============================================================================
-- Migration 071: LEDGER PURE CORE FINANCIAL FUNCTIONS
-- ============================================================================
-- Purpose:
--   1. Refactor transfer_funds, withdraw_funds, request_payout, and 
--      process_subscription_payment to be strictly ledger-pure.
--   2. Remove all manual wallet balance updates within these functions.
--   3. Rely on trg_sync_wallet_balance (Migration 067) for balance derivation.
-- ============================================================================

BEGIN;

-- 1. REFACTOR TRANSFER_FUNDS (User-to-User)
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
    v_available NUMERIC;
BEGIN
    -- Use ledger available balance for check
    v_available := public.calculate_wallet_available_balance_from_ledger(p_sender_wallet_id);
    
    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds (Available: %, Required: %)', v_available, (p_amount + p_fee);
    END IF;

    SELECT user_id INTO v_sender_user_id FROM wallets WHERE id = p_sender_wallet_id;
    
    -- Get or Create Receiver Wallet
    SELECT user_id INTO v_receiver_user_id FROM wallets WHERE id = p_receiver_wallet_id;
    
    IF v_receiver_user_id IS NULL AND p_receiver_wallet_id IS NOT NULL THEN
       -- This case shouldn't happen if p_receiver_wallet_id is a valid ID but user_id is null? 
       -- Actually, usually we have the receiver_user_id in the backend and want to transfer to THEIR wallet.
       -- Let's change the RPC to accept receiver_user_id instead of wallet_id for more flexibility.
    END IF;

    v_ref_id := uuid_generate_v4();

    -- Record Sender Transaction (DEBIT)
    -- Trigger automatically updates sender wallet balance
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

    -- Record Receiver Transaction (CREDIT)
    -- Trigger automatically updates receiver wallet balance
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

    -- Platform Fee Transaction (If applicable)
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        INSERT INTO public.transactions (
            wallet_id, user_id, type, display_label, category,
            amount, currency, status, reference_id, provider, metadata, completed_at
        ) VALUES (
            p_platform_wallet_id, (SELECT user_id FROM wallets WHERE id = p_platform_wallet_id), 
            'SYSTEM_CREDIT', 'Transfer Fee Revenue', 'revenue',
            p_fee, p_currency, 'COMPLETED', v_ref_id, 'system', p_metadata, NOW()
        );
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. REFACTOR WITHDRAW_FUNDS (External Transfer)
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
    v_available NUMERIC;
BEGIN
    v_available := public.calculate_wallet_available_balance_from_ledger(p_wallet_id);
    
    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient available funds for withdrawal';
    END IF;

    SELECT user_id INTO v_user_id FROM wallets WHERE id = p_wallet_id;

    -- Record Withdrawal Transaction (DEBIT)
    -- Trigger handles balance update
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        exchange_rate, provider, metadata, completed_at,
        transaction_fee_breakdown
    ) VALUES (
        p_wallet_id, v_user_id, 'WITHDRAWAL', 'Withdrawal', 'withdrawal',
        p_amount, p_currency, 'COMPLETED', uuid_generate_v4(), p_fee,
        p_rate, 'internal', p_metadata, NOW(),
        jsonb_build_object('withdrawal_fee', p_fee)
    ) RETURNING id INTO v_tx_id;

    -- Platform Fee Transaction
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        INSERT INTO public.transactions (
            wallet_id, user_id, type, display_label, category,
            amount, currency, status, reference_id, provider, metadata, completed_at
        ) VALUES (
            p_platform_wallet_id, (SELECT user_id FROM wallets WHERE id = p_platform_wallet_id), 
            'SYSTEM_CREDIT', 'Withdrawal Fee Revenue', 'revenue',
            p_fee, p_currency, 'COMPLETED', v_tx_id, 'system', p_metadata, NOW()
        );
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. REFACTOR REQUEST_PAYOUT (Admin Review Required)
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
    v_available NUMERIC;
BEGIN
    v_available := public.calculate_wallet_available_balance_from_ledger(p_wallet_id);

    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient available balance for payout request';
    END IF;

    -- 1. Create PENDING transaction. 
    -- trg_sync_wallet_balance will automatically REDUCE available_balance (reserve funds).
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, fee,
        provider, metadata
    ) VALUES (
        p_wallet_id, p_user_id, 'PAYOUT', 'Payout Request', 'payout',
        p_amount, p_currency, 'PENDING', p_fee,
        'manual', p_metadata
    ) RETURNING id INTO v_tx_id;

    -- 2. Create payout request for admin queue
    INSERT INTO public.payout_requests (
        user_id, wallet_id, transaction_id,
        amount, fee, net_amount, currency,
        payout_method, destination, status, metadata
    ) VALUES (
        p_user_id, p_wallet_id, v_tx_id,
        p_amount, p_fee, p_amount, p_currency,
        p_payout_method, p_destination, 'pending_review', p_metadata
    ) RETURNING id INTO v_payout_id;

    RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. REFACTOR PROCESS_SUBSCRIPTION_PAYMENT
CREATE OR REPLACE FUNCTION public.process_subscription_payment(
    p_user_id           UUID,
    p_plan_from         TEXT,
    p_plan_to           TEXT,
    p_amount            NUMERIC,
    p_currency          TEXT,
    p_provider          TEXT,
    p_provider_reference TEXT,
    p_exchange_rate     NUMERIC DEFAULT 1,
    p_charged_amount    NUMERIC DEFAULT 0,
    p_metadata          JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_sub_id UUID;
    v_wallet_id UUID;
BEGIN
    -- Get/Create wallet
    SELECT id INTO v_wallet_id FROM wallets WHERE user_id = p_user_id AND currency = p_currency LIMIT 1;
    IF v_wallet_id IS NULL THEN
        INSERT INTO wallets (user_id, currency, balance, available_balance, address)
        VALUES (p_user_id, p_currency, 0, 0, uuid_generate_v4()::text)
        RETURNING id INTO v_wallet_id;
    END IF;

    -- Record Transaction. Trigger handles balance update (this is effectively a DEPOSIT logic since it's external money)
    -- But since it's a "payment", we record it as SUBSCRIPTION_PAYMENT.
    -- To keep it ledger-pure: we need to decide if this is a credit or debit.
    -- Usually payment -> credit to wallet then immediately debit? No, simpler:
    -- Just insert it as a special type that is credit-like or handles it.
    -- Re-check calculate_wallet_balance_from_ledger (067):
    -- Credits: TRANSFER_IN, SWAP_IN, DEPOSIT, AFFILIATE_COMMISSION, REFUND
    -- Debits: WITHDRAWAL, TRANSFER_OUT, SWAP_OUT, PAYOUT, SUBSCRIPTION_PAYMENT, AD_PAYMENT, BUY
    
    -- Actually, if a user pays external money for a sub, it's a deposit + immediate purchase.
    -- Let's record it as a SUBSCRIPTION_PAYMENT (Debit) but we must ensure we have balance first?
    -- No, usually these external payments don't touch the wallet balance unless it's "Wallet -> Sub".
    -- If it's "Card -> Sub", we record it for history but it shouldn't affect wallet balance unless we want to "wash" it through the wallet.
    
    -- Let's stick to the current schema where SUBSCRIPTION_PAYMENT is a debit.
    -- If it's card payment, we "system credit" the amount first.
    
    -- System Credit (Deposit equivalent)
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, provider, provider_reference,
        exchange_rate, charged_amount_ngn, metadata, completed_at
    ) VALUES (
        v_wallet_id, p_user_id, 'DEPOSIT', 'Subscription Payment External', 'subscription',
        p_amount, p_currency, 'COMPLETED', p_provider, p_provider_reference,
        p_exchange_rate, p_charged_amount, p_metadata, NOW()
    );

    -- Immediate Debit for the plan
    INSERT INTO public.transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, provider, provider_reference,
        exchange_rate, metadata, completed_at
    ) VALUES (
        v_wallet_id, p_user_id, 'SUBSCRIPTION_PAYMENT', 'Subscription – ' || p_plan_to, 'subscription',
        p_amount, p_currency, 'COMPLETED', p_provider, p_provider_reference,
        p_exchange_rate, p_metadata, NOW()
    ) RETURNING id INTO v_tx_id;

    -- Update linked tables
    SELECT id INTO v_sub_id FROM subscriptions WHERE user_id = p_user_id LIMIT 1;
    
    INSERT INTO subscription_transactions (
        user_id, subscription_id, transaction_id,
        event_type, plan_from, plan_to,
        amount, currency, provider, provider_reference,
        status, metadata
    ) VALUES (
        p_user_id, v_sub_id, v_tx_id,
        CASE WHEN p_plan_from = 'FREE' THEN 'initial_payment'
             WHEN p_plan_to > p_plan_from THEN 'upgrade'
             ELSE 'renewal' END,
        p_plan_from, p_plan_to,
        p_amount, p_currency, p_provider, p_provider_reference,
        'completed', p_metadata
    );

    UPDATE subscriptions
    SET plan_tier = p_plan_to,
        plan_type = p_plan_to,
        status = 'active',
        paystack_transaction_reference = p_provider_reference,
        start_date = NOW(),
        end_date = NOW() + INTERVAL '30 days',
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. REFACTOR APPROVE_PAYOUT
CREATE OR REPLACE FUNCTION public.approve_payout(
    p_payout_id  UUID,
    p_admin_id   UUID,
    p_note       TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_payout public.payout_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;

    IF v_payout.status != 'pending_review' THEN
        RAISE EXCEPTION 'Payout is not in reviewable state';
    END IF;

    -- Update linked transaction. 
    -- Trigger (Migration 067) will automatically deduct v_payout.amount from wallets.balance.
    UPDATE public.transactions
    SET status = 'COMPLETED',
        completed_at = NOW(),
        updated_at = NOW(),
        metadata = metadata || jsonb_build_object('approved_by', p_admin_id, 'approval_note', p_note)
    WHERE id = v_payout.transaction_id;

    -- Update payout request status
    UPDATE public.payout_requests
    SET status = 'approved',
        reviewed_by = p_admin_id,
        reviewed_at = NOW(),
        review_note = p_note,
        updated_at = NOW()
    WHERE id = p_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
