-- ============================================================================
-- Migration 072: STRICT LEDGER-BASED CORE ARCHITECTURE (COINBASE STYLE)
-- ============================================================================
-- Purpose:
--   1. Implement a true Double-Entry Ledger system.
--   2. Balance is CALCULATED on-the-fly from the ledger, NEVER stored.
--   3. Absolute Source of Truth: public.ledger_entries.
-- ============================================================================

BEGIN;

-- 1. CREATE LEDGER_ENTRIES TABLE
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_id   UUID NOT NULL, -- We'll link to wallets table later to avoid circular rename issues
    currency    VARCHAR(10) NOT NULL,
    amount      NUMERIC(30,18) NOT NULL, -- Positive for credit, negative for debit
    type        TEXT NOT NULL,
    reference   UUID,
    status      TEXT NOT NULL DEFAULT 'confirmed',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    -- UNIQUE CONSTRAINT: Prevents double-crediting/debiting for the same reference
    CONSTRAINT unique_ledger_entry UNIQUE (reference, wallet_id, type)
);

-- 2. REFACTOR WALLETS TABLE (The Storage Layer)
-- We rename the table to avoid conflict with the View we'll create later.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallets' AND table_schema = 'public') THEN
        ALTER TABLE public.wallets RENAME TO wallets_store;
    END IF;
END $$;

-- Drop stored balance columns - Balance is now CALCULATED.
ALTER TABLE IF EXISTS public.wallets_store DROP COLUMN IF EXISTS balance;
ALTER TABLE IF EXISTS public.wallets_store DROP COLUMN IF EXISTS available_balance;

-- Correct the Foreign Key for ledger
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_wallet_id_fkey') THEN
        ALTER TABLE public.ledger_entries 
        ADD CONSTRAINT ledger_entries_wallet_id_fkey 
        FOREIGN KEY (wallet_id) REFERENCES public.wallets_store(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ledger_wallet_id ON public.ledger_entries(wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON public.ledger_entries(reference);

-- 3. CALCULATION FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_wallet_id UUID)
RETURNS NUMERIC AS $$
    SELECT COALESCE(SUM(amount), 0)
    FROM public.ledger_entries
    WHERE wallet_id = p_wallet_id AND status = 'confirmed';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.get_wallet_available_balance(p_wallet_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC;
    v_pending_debits NUMERIC;
BEGIN
    v_balance := public.get_wallet_balance(p_wallet_id);
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_pending_debits
    FROM public.ledger_entries
    WHERE wallet_id = p_wallet_id AND status = 'pending' AND amount < 0;
    RETURN v_balance - v_pending_debits;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. CREATE THE WALLETS INTERFACE (The View)
-- This view acts like the old table but calculates balance on the fly.
CREATE OR REPLACE VIEW public.wallets AS
SELECT 
    w.id,
    w.user_id,
    w.currency,
    w.address,
    w.is_frozen,
    w.created_at,
    w.updated_at,
    public.get_wallet_balance(w.id) as balance,
    public.get_wallet_available_balance(w.id) as available_balance
FROM public.wallets_store w;

-- Support for legacy inserts/updates on the wallets view
CREATE OR REPLACE FUNCTION public.trg_wallets_upsert_fn()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.wallets_store (id, user_id, currency, address, is_frozen)
        VALUES (COALESCE(NEW.id, uuid_generate_v4()), NEW.user_id, NEW.currency, NEW.address, COALESCE(NEW.is_frozen, false))
        RETURNING * INTO NEW;
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE public.wallets_store
        SET address = NEW.address,
            is_frozen = NEW.is_frozen,
            updated_at = NOW()
        WHERE id = OLD.id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wallets_upsert
INSTEAD OF INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.trg_wallets_upsert_fn();

-- 5. UPDATE TRANSACTIONS (Header Alignment)
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS from_currency     VARCHAR(10),
    ADD COLUMN IF NOT EXISTS to_currency       VARCHAR(10),
    ADD COLUMN IF NOT EXISTS amount_from       NUMERIC(30,18),
    ADD COLUMN IF NOT EXISTS amount_to         NUMERIC(30,18),
    ADD COLUMN IF NOT EXISTS rate              NUMERIC;

-- Data Cleanup & Migration
UPDATE public.transactions t SET user_id = w.user_id FROM public.wallets_store w WHERE t.wallet_id = w.id AND t.user_id IS NULL;
UPDATE public.transactions t SET wallet_id = w.id FROM public.wallets_store w WHERE t.user_id = w.user_id AND t.currency = w.currency AND t.wallet_id IS NULL;

-- Backfill Ledger
INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status, created_at)
SELECT 
    COALESCE(t.user_id, w.user_id), 
    COALESCE(t.wallet_id, w.id), 
    t.currency, 
    CASE 
        WHEN t.type IN ('DEPOSIT', 'TRANSFER_IN', 'SWAP_IN', 'AFFILIATE_COMMISSION', 'REFUND', 'SYSTEM_CREDIT', 'deposit', 'transfer_in', 'swap_credit', 'affiliate_commission') THEN t.amount
        ELSE -(t.amount + COALESCE(t.fee, 0))
    END,
    LOWER(t.type), t.id,
    CASE WHEN t.status IN ('COMPLETED', 'confirmed') THEN 'confirmed' WHEN t.status IN ('PENDING', 'processing') THEN 'pending' ELSE 'failed' END,
    t.created_at
FROM public.transactions t
LEFT JOIN public.wallets_store w ON (w.id = t.wallet_id OR (w.user_id = t.user_id AND w.currency = t.currency))
WHERE (t.user_id IS NOT NULL OR w.user_id IS NOT NULL) AND (t.wallet_id IS NOT NULL OR w.id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- 6. ATOMIC RPC FUNCTIONS (Refactored)

-- A. CREDIT (Hardened)
CREATE OR REPLACE FUNCTION public.credit_wallet_atomic(
    p_wallet_id UUID, 
    p_amount NUMERIC, 
    p_idempotency_key TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE v_tx_id UUID; v_user_id UUID; v_currency VARCHAR;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;
    END IF;

    -- Lock wallet
    SELECT user_id, currency INTO v_user_id, v_currency FROM public.wallets_store WHERE id = p_wallet_id FOR UPDATE;
    
    INSERT INTO public.transactions (user_id, wallet_id, type, from_currency, to_currency, amount_from, amount_to, status, display_label, idempotency_key, metadata)
    VALUES (v_user_id, p_wallet_id, 'deposit', v_currency, v_currency, p_amount, p_amount, 'COMPLETED', 'System Credit', p_idempotency_key, p_metadata) RETURNING id INTO v_tx_id;
    
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference)
    VALUES (v_user_id, p_wallet_id, v_currency, p_amount, 'deposit', v_tx_id);
    
    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. TRANSFER (Hardened)
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

    -- Lock sender wallet
    PERFORM 1 FROM public.wallets_store WHERE id = p_sender_wallet_id FOR UPDATE;
    
    v_avail := public.get_wallet_available_balance(p_sender_wallet_id);
    IF v_avail < (p_amount + p_fee) THEN RAISE EXCEPTION 'Insufficient funds (Avail: %, Req: %)', v_avail, (p_amount + p_fee); END IF;
    
    SELECT user_id INTO v_s_uid FROM public.wallets_store WHERE id = p_sender_wallet_id;
    SELECT user_id INTO v_r_uid FROM public.wallets_store WHERE id = p_receiver_wallet_id;
    
    INSERT INTO public.transactions (user_id, wallet_id, type, from_currency, to_currency, amount_from, amount_to, status, idempotency_key, metadata)
    VALUES (v_s_uid, p_sender_wallet_id, 'transfer', p_currency, p_currency, p_amount, p_amount, 'COMPLETED', p_idempotency_key, p_metadata) RETURNING id INTO v_tx_id;
    
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) VALUES (v_s_uid, p_sender_wallet_id, p_currency, -(p_amount + p_fee), 'transfer_out', v_tx_id);
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) VALUES (v_r_uid, p_receiver_wallet_id, p_currency, p_amount, 'transfer_in', v_tx_id);
    
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference)
        VALUES ((SELECT user_id FROM public.wallets_store WHERE id = p_platform_wallet_id), p_platform_wallet_id, p_currency, p_fee, 'fee', v_tx_id);
    END IF;
    
    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. SWAP (Refactor for Strict Atomicity)
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
DECLARE 
    v_tx_id UUID; 
    v_avail NUMERIC;
    v_platform_uid UUID;
BEGIN
    -- 1. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE metadata->>'idempotency_key' = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;
    END IF;

    -- 2. Balance Check
    v_avail := public.get_wallet_available_balance(p_from_wallet_id);
    IF v_avail < (p_from_amount + p_fee) THEN 
        RAISE EXCEPTION 'Insufficient balance for swap (Available: %, Required: %)', v_avail, (p_from_amount + p_fee); 
    END IF;

    -- Step 1: Create Transaction Record (PENDING)
    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency, 
        amount_from, amount_to, rate, status, metadata
    ) VALUES (
        p_user_id, p_from_wallet_id, 'swap', p_from_currency, p_to_currency, 
        p_from_amount, p_to_amount, p_rate, 'PENDING', 
        p_metadata || jsonb_build_object('idempotency_key', p_idempotency_key)
    ) RETURNING id INTO v_tx_id;

    -- Step 2: Insert Ledger Entries (Confirmed immediately)
    -- Debit BTC
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status) 
    VALUES (p_user_id, p_from_wallet_id, p_from_currency, -(p_from_amount + p_fee), 'swap_debit', v_tx_id, 'confirmed');

    -- Credit ETH
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status) 
    VALUES (p_user_id, p_to_wallet_id, p_to_currency, p_to_amount, 'swap_credit', v_tx_id, 'confirmed');

    -- Step 3: Platform Fee Split (if applicable)
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        SELECT user_id INTO v_platform_uid FROM public.wallets_store WHERE id = p_platform_wallet_id;
        INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status)
        VALUES (v_platform_uid, p_platform_wallet_id, p_from_currency, p_fee, 'fee', v_tx_id, 'confirmed');
    END IF;

    -- Step 4: Mark Transaction COMPLETED
    UPDATE public.transactions 
    SET status = 'COMPLETED',
        updated_at = NOW(),
        completed_at = NOW()
    WHERE id = v_tx_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. CONFIRM DEPOSIT
CREATE OR REPLACE FUNCTION public.confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id      UUID,
    p_amount         NUMERIC,
    p_external_hash  TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
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

-- E. WITHDRAW FUNDS (Hardened)
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
DECLARE
    v_tx_id UUID;
    v_user_id UUID;
    v_available NUMERIC;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;
    END IF;

    -- Lock wallet
    PERFORM 1 FROM public.wallets_store WHERE id = p_wallet_id FOR UPDATE;

    v_available := public.get_wallet_available_balance(p_wallet_id);
    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds (Available: %, Required: %)', v_available, (p_amount + p_fee);
    END IF;

    SELECT user_id INTO v_user_id FROM public.wallets_store WHERE id = p_wallet_id;

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

    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference)
        VALUES ((SELECT user_id FROM public.wallets_store WHERE id = p_platform_wallet_id), p_platform_wallet_id, p_currency, p_fee, 'fee', v_tx_id);
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- F. REQUEST PAYOUT
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
    v_tx_id UUID;
    v_payout_id UUID;
    v_available NUMERIC;
BEGIN
    v_available := public.get_wallet_available_balance(p_wallet_id);
    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds for payout';
    END IF;

    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency,
        amount_from, amount_to, status, fee,
        display_label, category, provider, metadata, created_at
    ) VALUES (
        p_user_id, p_wallet_id, 'payout', p_currency, p_currency,
        p_amount, p_amount, 'PENDING', p_fee,
        'Payout Request', 'payout', 'manual', p_metadata, NOW()
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status)
    VALUES (p_user_id, p_wallet_id, p_currency, -(p_amount + p_fee), 'payout', v_tx_id, 'pending');

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

-- G. APPROVE PAYOUT
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

-- H. PROCESS SUBSCRIPTION PAYMENT
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
    v_wallet_id UUID;
    v_sub_id UUID;
BEGIN
    SELECT id INTO v_wallet_id FROM public.wallets_store WHERE user_id = p_user_id AND currency = p_currency LIMIT 1;
    IF v_wallet_id IS NULL THEN
        INSERT INTO public.wallets_store (user_id, currency, address)
        VALUES (p_user_id, p_currency, uuid_generate_v4()::text)
        RETURNING id INTO v_wallet_id;
    END IF;

    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency,
        amount_from, amount_to, status, provider, provider_reference,
        exchange_rate, display_label, category, metadata, created_at, completed_at
    ) VALUES (
        p_user_id, v_wallet_id, 'subscription_payment', p_currency, p_currency,
        p_amount, p_amount, 'COMPLETED', p_provider, p_provider_reference,
        p_exchange_rate, 'Subscription – ' || p_plan_to, 'subscription', p_metadata, NOW(), NOW()
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status)
    VALUES (p_user_id, v_wallet_id, p_currency, -p_amount, 'subscription_payment', v_tx_id, 'confirmed');

    SELECT id INTO v_sub_id FROM subscriptions WHERE user_id = p_user_id LIMIT 1;
    
    INSERT INTO subscription_transactions (
        user_id, subscription_id, transaction_id,
        event_type, plan_from, plan_to,
        amount, currency, provider, provider_reference,
        status, metadata
    ) VALUES (
        p_user_id, v_sub_id, v_tx_id,
        CASE WHEN p_plan_from = 'FREE' THEN 'initial_payment' ELSE 'upgrade' END,
        p_plan_from, p_plan_to,
        p_amount, p_currency, p_provider, p_provider_reference,
        'completed', p_metadata
    );

    UPDATE subscriptions
    SET plan_tier = p_plan_to,
        plan_type = p_plan_to,
        status = 'active',
        paystack_transaction_reference = p_provider_reference,
        end_date = NOW() + INTERVAL '30 days',
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- I. ADD AFFILIATE COMMISSION
CREATE OR REPLACE FUNCTION public.add_affiliate_commission(
    p_referred_user_id UUID,
    p_revenue_amount   NUMERIC,
    p_currency         TEXT,
    p_source_tx_id     UUID
) RETURNS VOID AS $$
DECLARE
    v_referrer_id UUID;
    v_commission_percentage NUMERIC;
    v_commission_amount NUMERIC;
    v_referrer_wallet_id UUID;
    v_tx_id UUID;
BEGIN
    SELECT referrer_user_id, commission_percentage INTO v_referrer_id, v_commission_percentage
    FROM public.affiliate_referrals WHERE referred_user_id = p_referred_user_id;

    IF v_referrer_id IS NOT NULL THEN
        v_commission_amount := (p_revenue_amount * v_commission_percentage) / 100.0;

        IF v_commission_amount > 0 THEN
            UPDATE public.affiliate_referrals 
            SET total_commission_earned = total_commission_earned + v_commission_amount
            WHERE referred_user_id = p_referred_user_id;

            SELECT id INTO v_referrer_wallet_id FROM public.wallets_store WHERE user_id = v_referrer_id AND currency = p_currency LIMIT 1;
            
            IF v_referrer_wallet_id IS NULL THEN
                INSERT INTO public.wallets_store (user_id, currency, address)
                VALUES (v_referrer_id, p_currency, uuid_generate_v4()::text)
                RETURNING id INTO v_referrer_wallet_id;
            END IF;

            INSERT INTO public.transactions (
                user_id, wallet_id, type, from_currency, to_currency,
                amount_from, amount_to, status, display_label, category, 
                metadata, created_at, completed_at
            ) VALUES (
                v_referrer_id, v_referrer_wallet_id, 'affiliate_commission', p_currency, p_currency,
                v_commission_amount, v_commission_amount, 'COMPLETED', 'Affiliate Commission', 'revenue',
                jsonb_build_object('referred_user_id', p_referred_user_id, 'source_tx_id', p_source_tx_id), NOW(), NOW()
            ) RETURNING id INTO v_tx_id;

            INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status)
            VALUES (v_referrer_id, v_referrer_wallet_id, p_currency, v_commission_amount, 'affiliate_commission', v_tx_id, 'confirmed');
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. AUTO-LEDGER SAFETY TRIGGER
CREATE OR REPLACE FUNCTION public.trg_auto_ledger_fn()
RETURNS TRIGGER AS $$
DECLARE 
    v_exists BOOLEAN;
    v_wallet_id UUID;
BEGIN
    -- Transition to COMPLETED or confirmed 
    IF (NEW.status IN ('COMPLETED', 'confirmed') AND (OLD.status IS NULL OR OLD.status NOT IN ('COMPLETED', 'confirmed'))) THEN
        SELECT EXISTS (SELECT 1 FROM public.ledger_entries WHERE reference = NEW.id) INTO v_exists;
        
        IF NOT v_exists THEN
            -- Try to resolve wallet_id if missing
            v_wallet_id := NEW.wallet_id;
            IF v_wallet_id IS NULL THEN
                SELECT id INTO v_wallet_id FROM public.wallets_store 
                WHERE user_id = NEW.user_id AND currency = COALESCE(NEW.from_currency, NEW.currency) 
                LIMIT 1;
            END IF;

            IF v_wallet_id IS NOT NULL THEN
                INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status)
                VALUES (
                    NEW.user_id, 
                    v_wallet_id, 
                    COALESCE(NEW.from_currency, NEW.currency), 
                    CASE 
                        WHEN NEW.type IN ('DEPOSIT', 'deposit', 'FUNDING', 'funding', 'Digital Assets Purchase', 'transfer_in', 'swap_credit', 'affiliate_commission') THEN ABS(COALESCE(NEW.amount_from, NEW.amount))
                        ELSE -ABS(COALESCE(NEW.amount_from, NEW.amount) + COALESCE(NEW.fee, 0)) 
                    END,
                    LOWER(NEW.type), 
                    NEW.id,
                    'confirmed'
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_ledger ON public.transactions;
CREATE TRIGGER trg_auto_ledger AFTER INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.trg_auto_ledger_fn();

-- 8. ENABLE REALTIME
-- This is required for the frontend to receive live updates
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ledger_entries') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_entries;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
        END IF;
    END IF;
END $$;

COMMIT;
