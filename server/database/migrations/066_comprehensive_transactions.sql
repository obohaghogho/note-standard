-- ============================================================================
-- Migration 066: COMPREHENSIVE TRANSACTION SYSTEM
-- ============================================================================
-- Purpose: Consolidate and harden the entire transaction ledger.
--          This migration is ADDITIVE — it does NOT drop existing tables.
--          It adds missing columns, creates new tables, rebuilds RPC functions,
--          and installs analytics views + audit triggers.
--
-- Tables affected/created:
--   transactions        – core immutable ledger (ALTER)
--   transaction_events  – NEW: granular status-change audit log
--   payment_intents     – NEW: pre-transaction checkout sessions
--   subscription_transactions – NEW: links subs to payments
--   payout_requests     – NEW: admin-approved withdrawal queue
--
-- Functions rebuilt:
--   transfer_funds, withdraw_funds, confirm_deposit,
--   credit_wallet_atomic, execute_swap_atomic,
--   process_subscription_payment, request_payout, approve_payout
--
-- Views:
--   v_user_transactions – user-friendly join for frontend
--   v_admin_transactions – admin dashboard view
--   v_revenue_summary   – revenue breakdown by day/type
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. PREREQUISITES
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reusable updated_at trigger (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 1. HARDEN THE CORE `transactions` TABLE
--    Add every column used across the codebase in a single pass.
-- ============================================================================

ALTER TABLE transactions
  -- Identity & linking
  ADD COLUMN IF NOT EXISTS user_id            UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reference_id       UUID,
  ADD COLUMN IF NOT EXISTS idempotency_key    TEXT UNIQUE,

  -- Payment provider info
  ADD COLUMN IF NOT EXISTS provider           TEXT,           -- 'paystack', 'flutterwave', 'nowpayments', 'internal'
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,           -- external ref from provider
  ADD COLUMN IF NOT EXISTS external_hash      TEXT,           -- blockchain hash or provider tx id

  -- Display & categorization
  ADD COLUMN IF NOT EXISTS display_label      TEXT DEFAULT 'Transaction',
  ADD COLUMN IF NOT EXISTS product_type       TEXT DEFAULT 'digital_asset',
  ADD COLUMN IF NOT EXISTS category           TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS description        TEXT,           -- human-readable note

  -- Financial details
  ADD COLUMN IF NOT EXISTS fee                NUMERIC(30,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spread_amount      NUMERIC(30,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_price       NUMERIC,
  ADD COLUMN IF NOT EXISTS final_price        NUMERIC,
  ADD COLUMN IF NOT EXISTS exchange_rate      NUMERIC,
  ADD COLUMN IF NOT EXISTS charged_amount_ngn NUMERIC,

  -- Internal coin tracking (for crypto purchases)
  ADD COLUMN IF NOT EXISTS internal_coin      TEXT,
  ADD COLUMN IF NOT EXISTS internal_amount    NUMERIC(30,18),

  -- Fee breakdown (structured)
  ADD COLUMN IF NOT EXISTS transaction_fee_breakdown JSONB DEFAULT '{}'::jsonb,

  -- Counterparty info (for transfers)
  ADD COLUMN IF NOT EXISTS sender_wallet_id   UUID,
  ADD COLUMN IF NOT EXISTS receiver_wallet_id UUID,
  ADD COLUMN IF NOT EXISTS counterparty_id    UUID,           -- the other user in a transfer

  -- Metadata & timestamps
  ADD COLUMN IF NOT EXISTS metadata           JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_address         INET,
  ADD COLUMN IF NOT EXISTS user_agent         TEXT,
  ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMPTZ;


-- Backfill user_id from wallet where missing
UPDATE transactions t
SET user_id = w.user_id
FROM wallets w
WHERE t.wallet_id = w.id AND t.user_id IS NULL;


-- ============================================================================
-- 2. INDEXES (idempotent)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tx_user_id            ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_wallet_id          ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_tx_status             ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_type               ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_provider           ON transactions(provider);
CREATE INDEX IF NOT EXISTS idx_tx_provider_ref       ON transactions(provider_reference);
CREATE INDEX IF NOT EXISTS idx_tx_external_hash      ON transactions(external_hash);
CREATE INDEX IF NOT EXISTS idx_tx_reference_id       ON transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_tx_idempotency        ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_tx_created_at         ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_category           ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_product_type       ON transactions(product_type);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tx_user_status        ON transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tx_user_type          ON transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_tx_wallet_status      ON transactions(wallet_id, status);


-- ============================================================================
-- 3. TRANSACTION EVENTS (Immutable Audit Log)
--    Every status change on a transaction gets logged here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS transaction_events (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status      TEXT NOT NULL,
    event_type      TEXT NOT NULL,    -- 'status_change', 'refund_initiated', 'chargeback', 'manual_override'
    actor_id        UUID,             -- user or admin who caused the event
    actor_type      TEXT DEFAULT 'system', -- 'user', 'admin', 'system', 'webhook'
    reason          TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_events_tx_id     ON transaction_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_events_type      ON transaction_events(event_type);
CREATE INDEX IF NOT EXISTS idx_tx_events_created   ON transaction_events(created_at DESC);

ALTER TABLE transaction_events ENABLE ROW LEVEL SECURITY;

-- Only admins and the transaction owner can see events
CREATE POLICY "Users can view own transaction events" ON transaction_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM transactions t
            JOIN wallets w ON w.id = t.wallet_id
            WHERE t.id = transaction_events.transaction_id
            AND w.user_id = auth.uid()
        )
    );


-- ============================================================================
-- 4. PAYMENT INTENTS (Pre-transaction checkout sessions)
--    Created BEFORE a payment is confirmed. Tracks the lifecycle
--    from "user clicked pay" to "webhook confirmed".
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_intents (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    intent_type       TEXT NOT NULL,       -- 'deposit', 'subscription', 'ad_payment', 'top_up'
    amount            NUMERIC(30,18) NOT NULL,
    currency          TEXT NOT NULL,
    charged_amount    NUMERIC(30,18),      -- amount in gateway currency (e.g. NGN)
    charged_currency  TEXT,                -- gateway currency
    exchange_rate     NUMERIC,
    provider          TEXT NOT NULL,       -- 'paystack', 'flutterwave', 'nowpayments'
    provider_reference TEXT,               -- reference sent to provider
    checkout_url      TEXT,                -- redirect URL
    access_code       TEXT,                -- Paystack access code
    status            TEXT DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','completed','failed','expired','cancelled')),
    wallet_id         UUID REFERENCES wallets(id),
    transaction_id    UUID REFERENCES transactions(id), -- linked after confirmation
    fee               NUMERIC(30,18) DEFAULT 0,
    metadata          JSONB DEFAULT '{}'::jsonb,
    expires_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_user_id         ON payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_pi_status           ON payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_pi_provider_ref     ON payment_intents(provider_reference);
CREATE INDEX IF NOT EXISTS idx_pi_intent_type      ON payment_intents(intent_type);

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment intents" ON payment_intents
    FOR SELECT USING (auth.uid() = user_id);

-- Trigger
CREATE TRIGGER update_payment_intents_updated_at
    BEFORE UPDATE ON payment_intents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 5. SUBSCRIPTION TRANSACTIONS
--    Links subscription lifecycle events to financial records.
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id     UUID REFERENCES subscriptions(id),
    transaction_id      UUID REFERENCES transactions(id),
    payment_intent_id   UUID REFERENCES payment_intents(id),
    event_type          TEXT NOT NULL,    -- 'initial_payment', 'renewal', 'upgrade', 'downgrade', 'cancellation_refund'
    plan_from           TEXT,             -- 'FREE', 'PRO', 'BUSINESS'
    plan_to             TEXT,
    amount              NUMERIC(30,18) NOT NULL,
    currency            TEXT NOT NULL,
    provider            TEXT,
    provider_reference  TEXT,
    status              TEXT DEFAULT 'pending'
                          CHECK (status IN ('pending','completed','failed','refunded')),
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_tx_user_id      ON subscription_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_tx_sub_id       ON subscription_transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_tx_event_type   ON subscription_transactions(event_type);

ALTER TABLE subscription_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription transactions" ON subscription_transactions
    FOR SELECT USING (auth.uid() = user_id);


-- ============================================================================
-- 6. PAYOUT REQUESTS (Admin-approved withdrawal queue)
--    For compliance: withdrawals above a threshold require admin approval.
-- ============================================================================
CREATE TABLE IF NOT EXISTS payout_requests (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_id         UUID NOT NULL REFERENCES wallets(id),
    transaction_id    UUID REFERENCES transactions(id),
    amount            NUMERIC(30,18) NOT NULL,
    fee               NUMERIC(30,18) DEFAULT 0,
    net_amount        NUMERIC(30,18) NOT NULL,
    currency          TEXT NOT NULL,
    payout_method     TEXT NOT NULL,        -- 'bank_transfer', 'crypto', 'mobile_money'
    destination       JSONB NOT NULL,       -- bank details or crypto address
    status            TEXT DEFAULT 'pending_review'
                        CHECK (status IN ('pending_review','approved','processing','completed','rejected','cancelled')),
    reviewed_by       UUID,                 -- admin user id
    reviewed_at       TIMESTAMPTZ,
    review_note       TEXT,
    provider          TEXT,
    provider_reference TEXT,
    completed_at      TIMESTAMPTZ,
    metadata          JSONB DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_user_id      ON payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_status        ON payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_payout_created       ON payout_requests(created_at DESC);

ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payout requests" ON payout_requests
    FOR SELECT USING (auth.uid() = user_id);

-- Trigger
CREATE TRIGGER update_payout_requests_updated_at
    BEFORE UPDATE ON payout_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 7. TRANSACTION STATUS CHANGE TRIGGER (Auto-audits every update)
-- ============================================================================
CREATE OR REPLACE FUNCTION log_transaction_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO transaction_events (
            transaction_id, previous_status, new_status, event_type, actor_type, metadata
        ) VALUES (
            NEW.id, OLD.status, NEW.status, 'status_change', 'system',
            jsonb_build_object(
                'old_updated_at', OLD.updated_at,
                'new_updated_at', NEW.updated_at
            )
        );

        -- Set timestamp columns based on new status
        IF NEW.status = 'COMPLETED' AND NEW.completed_at IS NULL THEN
            NEW.completed_at = NOW();
        ELSIF NEW.status = 'FAILED' AND NEW.failed_at IS NULL THEN
            NEW.failed_at = NOW();
        ELSIF NEW.status = 'CANCELLED' AND NEW.cancelled_at IS NULL THEN
            NEW.cancelled_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_tx_status_change ON transactions;
CREATE TRIGGER trg_log_tx_status_change
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION log_transaction_status_change();

-- Ensure updated_at trigger also exists
DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 8. REBUILT RPC FUNCTIONS (Atomic, with full audit trail)
-- ============================================================================

-- -------------------------------------------------------
-- 8X. DROP ALL OLD OVERLOADED FUNCTION SIGNATURES
--     Previous migrations created functions with different
--     param counts, causing ambiguity. We clean them all up.
-- -------------------------------------------------------

-- transfer_funds: 6-param version from migration 025/036
DROP FUNCTION IF EXISTS transfer_funds(UUID, UUID, NUMERIC, VARCHAR, NUMERIC, JSONB);
-- transfer_funds: 8-param version from migration 050
DROP FUNCTION IF EXISTS transfer_funds(UUID, UUID, NUMERIC, VARCHAR, NUMERIC, NUMERIC, UUID, JSONB);

-- withdraw_funds: all prior versions (same 7-param signature, but DECIMAL vs NUMERIC can differ)
DROP FUNCTION IF EXISTS withdraw_funds(UUID, DECIMAL, TEXT, DECIMAL, DECIMAL, UUID, JSONB);
DROP FUNCTION IF EXISTS withdraw_funds(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC, UUID, JSONB);

-- confirm_deposit: all prior versions
DROP FUNCTION IF EXISTS confirm_deposit(UUID, UUID, DECIMAL, TEXT);
DROP FUNCTION IF EXISTS confirm_deposit(UUID, UUID, NUMERIC, TEXT);

-- credit_wallet_atomic
DROP FUNCTION IF EXISTS credit_wallet_atomic(UUID, NUMERIC);

-- add_affiliate_commission from migration 051
DROP FUNCTION IF EXISTS add_affiliate_commission(UUID, NUMERIC, TEXT, UUID);

-- -------------------------------------------------------
-- 8A. TRANSFER FUNDS (Internal user-to-user)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION transfer_funds(
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
    v_final_metadata JSONB;
BEGIN
    -- Lock sender wallet for update (prevents double-spend)
    IF (SELECT balance FROM wallets WHERE id = p_sender_wallet_id FOR UPDATE) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;

    -- Get user IDs for audit
    SELECT user_id INTO v_sender_user_id FROM wallets WHERE id = p_sender_wallet_id;
    SELECT user_id INTO v_receiver_user_id FROM wallets WHERE id = p_receiver_wallet_id;

    v_ref_id := uuid_generate_v4();
    v_final_metadata := p_metadata || jsonb_build_object(
        'category', 'transfer',
        'product_type', 'internal_transfer',
        'sender_user_id', v_sender_user_id,
        'receiver_user_id', v_receiver_user_id
    );

    -- Debit Sender (both balances)
    UPDATE wallets
    SET balance = balance - (p_amount + p_fee),
        available_balance = GREATEST(0, available_balance - (p_amount + p_fee)),
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = p_sender_wallet_id;

    -- Credit Receiver (both balances)
    UPDATE wallets
    SET balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = p_receiver_wallet_id;

    -- Credit Platform Fees
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        UPDATE wallets
        SET balance = balance + p_fee,
            available_balance = available_balance + p_fee,
            updated_at = NOW()
        WHERE id = p_platform_wallet_id;
    END IF;

    -- Record Sender Transaction (DEBIT)
    INSERT INTO transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        sender_wallet_id, receiver_wallet_id, counterparty_id,
        provider, metadata, completed_at
    ) VALUES (
        p_sender_wallet_id, v_sender_user_id, 'TRANSFER_OUT', 'Transfer Sent', 'transfer',
        p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee,
        p_sender_wallet_id, p_receiver_wallet_id, v_receiver_user_id,
        'internal', v_final_metadata, NOW()
    ) RETURNING id INTO v_tx_id;

    -- Record Receiver Transaction (CREDIT)
    INSERT INTO transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        sender_wallet_id, receiver_wallet_id, counterparty_id,
        provider, metadata, completed_at
    ) VALUES (
        p_receiver_wallet_id, v_receiver_user_id, 'TRANSFER_IN', 'Transfer Received', 'transfer',
        p_amount, p_currency, 'COMPLETED', v_ref_id, 0,
        p_sender_wallet_id, p_receiver_wallet_id, v_sender_user_id,
        'internal', v_final_metadata, NOW()
    );

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- 8B. WITHDRAW FUNDS
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION withdraw_funds(
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
    v_ref_id UUID;
    v_user_id UUID;
    v_current_available NUMERIC;
    v_final_metadata JSONB;
BEGIN
    -- Lock wallet row
    SELECT available_balance, user_id INTO v_current_available, v_user_id
    FROM wallets WHERE id = p_wallet_id FOR UPDATE;

    IF v_current_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient available funds. Have: %, Need: %', v_current_available, (p_amount + p_fee);
    END IF;

    v_ref_id := uuid_generate_v4();
    v_final_metadata := p_metadata || jsonb_build_object(
        'category', 'withdrawal',
        'product_type', 'withdrawal',
        'exchange_rate', p_rate
    );

    -- Debit user
    UPDATE wallets
    SET balance = balance - (p_amount + p_fee),
        available_balance = available_balance - (p_amount + p_fee),
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Credit platform
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        UPDATE wallets
        SET balance = balance + p_fee,
            available_balance = available_balance + p_fee,
            updated_at = NOW()
        WHERE id = p_platform_wallet_id;
    END IF;

    -- Record transaction
    INSERT INTO transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        exchange_rate, provider, metadata, completed_at,
        transaction_fee_breakdown
    ) VALUES (
        p_wallet_id, v_user_id, 'WITHDRAWAL', 'Withdrawal', 'withdrawal',
        p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee,
        p_rate, 'internal', v_final_metadata, NOW(),
        jsonb_build_object('withdrawal_fee', p_fee)
    ) RETURNING id INTO v_tx_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- 8C. CONFIRM DEPOSIT (Webhook → credit wallet)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id      UUID,
    p_amount         NUMERIC,
    p_external_hash  TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status INTO v_current_status FROM transactions WHERE id = p_transaction_id FOR UPDATE;

    IF v_current_status != 'PENDING' THEN
        RETURN;  -- Already processed, idempotent
    END IF;

    -- Credit wallet
    UPDATE wallets
    SET balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Mark transaction completed
    UPDATE transactions
    SET status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- 8D. CREDIT WALLET (Simple atomic credit)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_wallet_atomic(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS VOID AS $$
BEGIN
    UPDATE wallets
    SET balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = p_wallet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- 8E. EXECUTE SWAP (Atomic currency exchange)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION execute_swap_atomic(
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
        SELECT id INTO v_tx_id FROM transactions WHERE idempotency_key = p_idempotency_key;
        IF v_tx_id IS NOT NULL THEN
            RETURN v_tx_id;  -- Already processed
        END IF;
    END IF;

    -- Lock source wallet
    IF (SELECT balance FROM wallets WHERE id = p_from_wallet_id FOR UPDATE) < (p_from_amount + p_fee) THEN
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

    -- Debit source wallet
    UPDATE wallets
    SET balance = balance - (p_from_amount + p_fee),
        available_balance = GREATEST(0, available_balance - (p_from_amount + p_fee)),
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = p_from_wallet_id;

    -- Credit destination wallet
    UPDATE wallets
    SET balance = balance + p_to_amount,
        available_balance = available_balance + p_to_amount,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = p_to_wallet_id;

    -- Platform fee
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        UPDATE wallets
        SET balance = balance + p_fee,
            available_balance = available_balance + p_fee,
            updated_at = NOW()
        WHERE id = p_platform_wallet_id;
    END IF;

    -- Record SELL side
    INSERT INTO transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        exchange_rate, spread_amount, market_price, final_price,
        internal_coin, internal_amount,
        provider, idempotency_key, metadata, completed_at,
        transaction_fee_breakdown
    ) VALUES (
        p_from_wallet_id, p_user_id, 'SWAP_OUT', 'Swap – Sold ' || p_from_currency, 'swap',
        p_from_amount, p_from_currency, 'COMPLETED', v_ref_id, p_fee,
        p_exchange_rate, p_spread_amount, p_exchange_rate, p_exchange_rate * (1 + COALESCE(p_spread_amount,0)),
        p_to_currency, p_to_amount,
        'internal', p_idempotency_key, v_final_metadata, NOW(),
        jsonb_build_object('swap_fee', p_fee, 'spread', p_spread_amount)
    ) RETURNING id INTO v_tx_id;

    -- Record BUY side
    INSERT INTO transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, reference_id, fee,
        exchange_rate, spread_amount,
        internal_coin, internal_amount,
        provider, metadata, completed_at
    ) VALUES (
        p_to_wallet_id, p_user_id, 'SWAP_IN', 'Swap – Bought ' || p_to_currency, 'swap',
        p_to_amount, p_to_currency, 'COMPLETED', v_ref_id, 0,
        p_exchange_rate, 0,
        p_from_currency, p_from_amount,
        'internal', v_final_metadata, NOW()
    );

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- 8F. PROCESS SUBSCRIPTION PAYMENT
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION process_subscription_payment(
    p_user_id           UUID,
    p_plan_from         TEXT,
    p_plan_to           TEXT,
    p_amount            NUMERIC,
    p_currency          TEXT,
    p_provider          TEXT,
    p_provider_reference TEXT,
    p_exchange_rate     NUMERIC DEFAULT 1,
    p_charged_amount    NUMERIC DEFAULT NULL,
    p_metadata          JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_sub_id UUID;
    v_wallet_id UUID;
BEGIN
    -- Get or create wallet
    SELECT id INTO v_wallet_id FROM wallets WHERE user_id = p_user_id AND currency = p_currency LIMIT 1;
    IF v_wallet_id IS NULL THEN
        INSERT INTO wallets (user_id, currency, balance, address)
        VALUES (p_user_id, p_currency, 0, uuid_generate_v4()::text)
        RETURNING id INTO v_wallet_id;
    END IF;

    -- Record the financial transaction
    INSERT INTO transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, provider, provider_reference,
        exchange_rate, charged_amount_ngn,
        metadata, completed_at
    ) VALUES (
        v_wallet_id, p_user_id, 'SUBSCRIPTION_PAYMENT', 'Subscription – ' || p_plan_to, 'subscription',
        p_amount, p_currency, 'COMPLETED', p_provider, p_provider_reference,
        p_exchange_rate, p_charged_amount,
        p_metadata, NOW()
    ) RETURNING id INTO v_tx_id;

    -- Get subscription
    SELECT id INTO v_sub_id FROM subscriptions WHERE user_id = p_user_id LIMIT 1;

    -- Record in subscription_transactions
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

    -- Update subscription
    UPDATE subscriptions
    SET plan_tier = p_plan_to,
        plan_type = p_plan_to,
        status = 'active',
        paystack_transaction_reference = p_provider_reference,
        start_date = NOW(),
        end_date = NOW() + INTERVAL '30 days',
        charged_amount_ngn = COALESCE(p_charged_amount, p_amount),
        exchange_rate = p_exchange_rate
    WHERE user_id = p_user_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- 8G. REQUEST PAYOUT (User initiates)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION request_payout(
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
    -- Lock wallet
    SELECT available_balance INTO v_available FROM wallets WHERE id = p_wallet_id FOR UPDATE;

    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient available balance for payout';
    END IF;

    -- Reserve funds (reduce available_balance but NOT total balance yet)
    UPDATE wallets
    SET available_balance = available_balance - (p_amount + p_fee),
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Create pending transaction
    INSERT INTO transactions (
        wallet_id, user_id, type, display_label, category,
        amount, currency, status, fee,
        provider, metadata
    ) VALUES (
        p_wallet_id, p_user_id, 'PAYOUT', 'Payout Request', 'payout',
        p_amount, p_currency, 'PENDING', p_fee,
        'manual', p_metadata
    ) RETURNING id INTO v_tx_id;

    -- Create payout request
    INSERT INTO payout_requests (
        user_id, wallet_id, transaction_id,
        amount, fee, net_amount, currency,
        payout_method, destination, metadata
    ) VALUES (
        p_user_id, p_wallet_id, v_tx_id,
        p_amount, p_fee, p_amount - p_fee, p_currency,
        p_payout_method, p_destination, p_metadata
    ) RETURNING id INTO v_payout_id;

    RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- 8H. APPROVE PAYOUT (Admin action)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_payout(
    p_payout_id  UUID,
    p_admin_id   UUID,
    p_note       TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_payout payout_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_payout FROM payout_requests WHERE id = p_payout_id FOR UPDATE;

    IF v_payout.status != 'pending_review' THEN
        RAISE EXCEPTION 'Payout is not in reviewable state';
    END IF;

    -- Deduct from total balance (was already deducted from available)
    UPDATE wallets
    SET balance = balance - (v_payout.amount + v_payout.fee),
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_payout.wallet_id;

    -- Update payout request
    UPDATE payout_requests
    SET status = 'approved',
        reviewed_by = p_admin_id,
        reviewed_at = NOW(),
        review_note = p_note,
        updated_at = NOW()
    WHERE id = p_payout_id;

    -- Update linked transaction
    UPDATE transactions
    SET status = 'COMPLETED',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_payout.transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- 8I. REJECT PAYOUT (Admin action → refund reserved funds)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_payout(
    p_payout_id  UUID,
    p_admin_id   UUID,
    p_reason     TEXT DEFAULT 'Rejected by admin'
) RETURNS VOID AS $$
DECLARE
    v_payout payout_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_payout FROM payout_requests WHERE id = p_payout_id FOR UPDATE;

    IF v_payout.status != 'pending_review' THEN
        RAISE EXCEPTION 'Payout is not in reviewable state';
    END IF;

    -- Refund reserved funds back to available_balance
    UPDATE wallets
    SET available_balance = available_balance + (v_payout.amount + v_payout.fee),
        updated_at = NOW()
    WHERE id = v_payout.wallet_id;

    -- Update payout request
    UPDATE payout_requests
    SET status = 'rejected',
        reviewed_by = p_admin_id,
        reviewed_at = NOW(),
        review_note = p_reason,
        updated_at = NOW()
    WHERE id = p_payout_id;

    -- Update linked transaction
    UPDATE transactions
    SET status = 'CANCELLED',
        cancelled_at = NOW(),
        metadata = metadata || jsonb_build_object('rejection_reason', p_reason),
        updated_at = NOW()
    WHERE id = v_payout.transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 9. RLS POLICY REFRESH FOR TRANSACTIONS
-- ============================================================================

-- Drop old policies safely
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Users can view transactions on their wallets
CREATE POLICY "Users can view own transactions" ON transactions
    FOR SELECT USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM wallets
            WHERE wallets.id = transactions.wallet_id
            AND wallets.user_id = auth.uid()
        )
    );

-- Admin full access (read-only through RLS; writes go through service_role)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Admins can view all transactions" ON transactions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );


-- ============================================================================
-- 10. VIEWS FOR FRONTEND & ADMIN
-- ============================================================================

-- User-friendly transaction view (for the wallet "activity" feed)
CREATE OR REPLACE VIEW v_user_transactions AS
SELECT
    t.id,
    t.user_id,
    t.wallet_id,
    t.type,
    t.display_label,
    t.category,
    t.description,
    t.amount,
    t.currency,
    t.fee,
    t.spread_amount,
    t.exchange_rate,
    t.status,
    t.provider,
    t.provider_reference,
    t.external_hash,
    t.reference_id,
    t.counterparty_id,
    t.metadata,
    t.transaction_fee_breakdown,
    t.created_at,
    t.completed_at,
    -- Derived fields
    w.currency AS wallet_currency,
    CASE
        WHEN t.type IN ('TRANSFER_IN', 'SWAP_IN', 'DEPOSIT', 'AFFILIATE_COMMISSION') THEN 'credit'
        WHEN t.type IN ('TRANSFER_OUT', 'SWAP_OUT', 'WITHDRAWAL', 'PAYOUT', 'SUBSCRIPTION_PAYMENT', 'AD_PAYMENT') THEN 'debit'
        ELSE 'other'
    END AS direction,
    -- Counterparty name (if available)
    cp.username AS counterparty_username,
    cp.full_name AS counterparty_name
FROM transactions t
LEFT JOIN wallets w ON w.id = t.wallet_id
LEFT JOIN profiles cp ON cp.id = t.counterparty_id;


-- Admin dashboard view (all transactions with user info)
CREATE OR REPLACE VIEW v_admin_transactions AS
SELECT
    t.id,
    t.user_id,
    p.username,
    p.email AS user_email,
    t.type,
    t.display_label,
    t.category,
    t.amount,
    t.currency,
    t.fee,
    t.spread_amount,
    t.status,
    t.provider,
    t.provider_reference,
    t.external_hash,
    t.metadata,
    t.created_at,
    t.completed_at,
    t.failed_at
FROM transactions t
LEFT JOIN profiles p ON p.id = t.user_id;


-- Revenue summary (for admin monetization dashboard)
CREATE OR REPLACE VIEW v_revenue_summary AS
SELECT
    DATE_TRUNC('day', created_at) AS day,
    revenue_type,
    SUM(amount) AS total_amount,
    COUNT(*) AS transaction_count,
    currency
FROM revenue_logs
GROUP BY day, revenue_type, currency
ORDER BY day DESC;


-- ============================================================================
-- 11. REALTIME PUBLICATION
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Ensure key tables are in the realtime publication
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'wallets') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'payment_intents') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE payment_intents;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'payout_requests') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE payout_requests;
    END IF;
END $$;


-- ============================================================================
-- 12. GRANT PERMISSIONS (with full argument lists to avoid ambiguity)
-- ============================================================================

-- Service role needs full access to these functions
GRANT EXECUTE ON FUNCTION transfer_funds(UUID, UUID, NUMERIC, VARCHAR, NUMERIC, NUMERIC, UUID, JSONB)           TO service_role;
GRANT EXECUTE ON FUNCTION withdraw_funds(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC, UUID, JSONB)                    TO service_role;
GRANT EXECUTE ON FUNCTION confirm_deposit(UUID, UUID, NUMERIC, TEXT)                                            TO service_role;
GRANT EXECUTE ON FUNCTION credit_wallet_atomic(UUID, NUMERIC)                                                   TO service_role;
GRANT EXECUTE ON FUNCTION execute_swap_atomic(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION process_subscription_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION request_payout(UUID, UUID, NUMERIC, TEXT, NUMERIC, TEXT, JSONB, JSONB)                 TO service_role;
GRANT EXECUTE ON FUNCTION approve_payout(UUID, UUID, TEXT)                                                      TO service_role;
GRANT EXECUTE ON FUNCTION reject_payout(UUID, UUID, TEXT)                                                       TO service_role;

-- Authenticated users can call transfer and swap
GRANT EXECUTE ON FUNCTION transfer_funds(UUID, UUID, NUMERIC, VARCHAR, NUMERIC, NUMERIC, UUID, JSONB)           TO authenticated;
GRANT EXECUTE ON FUNCTION execute_swap_atomic(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION request_payout(UUID, UUID, NUMERIC, TEXT, NUMERIC, TEXT, JSONB, JSONB)                 TO authenticated;


COMMIT;
