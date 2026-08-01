-- ============================================================
-- Migration 281: Settlement-Aware Balances
-- ============================================================
-- Purpose: Implements the three-tier balance model:
--   Available Balance  — withdrawable, settled funds
--   Pending Balance    — received but not yet settled
--   Reserved Balance   — held for an active withdrawal (= balance - available - pending)
--
-- Changes:
--   1. Add pending_balance + locked_balance columns to wallets_store
--   2. Rebuild wallets_v6 view with all three tiers
--   3. Create settlement_pending_items table (deposit tracking)
--   4. Create settlement_policies table (provider-driven rules)
--   5. Create RPCs for atomic balance lifecycle transitions
-- ============================================================

BEGIN;

-- ─── 1. Extend wallets_store ──────────────────────────────────────────────────
ALTER TABLE public.wallets_store
  ADD COLUMN IF NOT EXISTS pending_balance  NUMERIC(30,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_balance   NUMERIC(30,8) NOT NULL DEFAULT 0;

-- Soft constraint: no column may go negative
ALTER TABLE public.wallets_store
  DROP CONSTRAINT IF EXISTS chk_wallet_pending_non_neg;
ALTER TABLE public.wallets_store
  ADD CONSTRAINT chk_wallet_pending_non_neg
  CHECK (pending_balance >= 0 AND locked_balance >= 0);

-- ─── 2. Rebuild wallets_v6 view — expose all four tiers ──────────────────────
DROP VIEW IF EXISTS public.wallets_v6 CASCADE;
CREATE OR REPLACE VIEW public.wallets_v6 AS
SELECT
    ws.id,
    ws.user_id,
    ws.currency,
    ws.network,
    ws.address,
    ws.is_frozen,
    ws.provider,
    -- Total balance (ledger truth)
    GREATEST(0, ws.balance)                                       AS balance,
    -- Available: can be withdrawn right now
    GREATEST(0, ws.available_balance)                             AS available_balance,
    -- Pending: received but settlement not yet confirmed
    GREATEST(0, ws.pending_balance)                               AS pending_balance,
    -- Reserved: held for an active outbound payout
    GREATEST(0, ws.balance - ws.available_balance - ws.pending_balance)
                                                                  AS reserved_balance,
    -- Locked: frozen/compliance hold
    GREATEST(0, ws.locked_balance)                                AS locked_balance
FROM public.wallets_store ws
-- Exclude all system/institutional accounts from user-facing view
WHERE ws.address NOT LIKE 'SYSTEM_LP_%'
  AND ws.address NOT LIKE 'TREASURY_%'
  AND ws.address NOT LIKE 'SETTLEMENT_%'
  AND ws.address NOT LIKE 'REVENUE_%'
  AND ws.address NOT LIKE 'FX_POOL_%'
  AND ws.address NOT LIKE 'PENDING_%'
  AND ws.address NOT LIKE 'RECONCILIATION_%';

-- ─── 3. settlement_pending_items ─────────────────────────────────────────────
-- Tracks individual pending deposits so the background worker can promote them.
CREATE TABLE IF NOT EXISTS public.settlement_pending_items (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id                UUID NOT NULL REFERENCES public.wallets_store(id) ON DELETE CASCADE,
    user_id                  UUID NOT NULL,
    amount                   NUMERIC(30,8) NOT NULL CHECK (amount > 0),
    currency                 VARCHAR(10)   NOT NULL,
    provider                 VARCHAR(50)   NOT NULL,
    provider_reference       VARCHAR(200)  NOT NULL,
    provider_status          VARCHAR(50)   NOT NULL DEFAULT 'pending',
    -- When we expect settlement (filled from settlement_policies)
    expected_settlement_at   TIMESTAMPTZ,
    -- Filled when promoted to available
    promoted_at              TIMESTAMPTZ,
    -- How many times the sync worker has attempted promotion
    promotion_attempts       INT NOT NULL DEFAULT 0,
    -- Filled if manually flagged for review
    flagged_for_review       BOOLEAN NOT NULL DEFAULT FALSE,
    flag_reason              TEXT,
    -- Ledger correlation id for this pending credit
    ledger_correlation_id    UUID,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pending_item_provider_ref UNIQUE (provider, provider_reference)
);

CREATE INDEX IF NOT EXISTS idx_spi_wallet_id      ON public.settlement_pending_items(wallet_id);
CREATE INDEX IF NOT EXISTS idx_spi_user_id        ON public.settlement_pending_items(user_id);
CREATE INDEX IF NOT EXISTS idx_spi_promoted       ON public.settlement_pending_items(promoted_at) WHERE promoted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_spi_provider       ON public.settlement_pending_items(provider, provider_status);
CREATE INDEX IF NOT EXISTS idx_spi_flagged        ON public.settlement_pending_items(flagged_for_review) WHERE flagged_for_review = TRUE;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.spi_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS spi_updated_at_trigger ON public.settlement_pending_items;
CREATE TRIGGER spi_updated_at_trigger
    BEFORE UPDATE ON public.settlement_pending_items
    FOR EACH ROW EXECUTE FUNCTION public.spi_set_updated_at();

-- RLS
ALTER TABLE public.settlement_pending_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY spi_service_write ON public.settlement_pending_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. settlement_policies ──────────────────────────────────────────────────
-- Provider-driven settlement rules. Configurable without code changes.
CREATE TABLE IF NOT EXISTS public.settlement_policies (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider                 VARCHAR(50)  NOT NULL,
    currency                 VARCHAR(10)  NOT NULL,
    -- How long after deposit_received before funds are considered settled (minutes)
    settlement_window_minutes INT NOT NULL DEFAULT 60,
    -- Auto-reserve timeout for withdrawals (minutes). After this, reservation is released.
    withdrawal_timeout_minutes INT NOT NULL DEFAULT 4320,  -- 72 hours default
    -- Deposit behaviour
    deposit_settles_instantly BOOLEAN NOT NULL DEFAULT FALSE,
    -- Human-readable description
    description              TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_policy_provider_currency UNIQUE (provider, currency)
);

-- Seed Fincra policies (provider-driven, admin-configurable)
INSERT INTO public.settlement_policies
    (provider, currency, settlement_window_minutes, withdrawal_timeout_minutes, deposit_settles_instantly, description)
VALUES
    ('fincra', 'NGN',  0,    1440,  TRUE,  'NGN settles instantly on Fincra. Withdrawal timeout: 24h.'),
    ('fincra', 'USD',  1440, 4320,  FALSE, 'USD settles T+1 on Fincra. Withdrawal timeout: 72h.'),
    ('fincra', 'EUR',  1440, 4320,  FALSE, 'EUR settles T+1 on Fincra. Withdrawal timeout: 72h.'),
    ('fincra', 'GBP',  1440, 4320,  FALSE, 'GBP settles T+1 on Fincra. Withdrawal timeout: 72h.'),
    ('fincra', 'CAD',  2880, 4320,  FALSE, 'CAD settles T+2 on Fincra. Withdrawal timeout: 72h.'),
    ('fincra', 'GHS',  60,   2880,  FALSE, 'GHS settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'KES',  60,   2880,  FALSE, 'KES settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'TZS',  60,   2880,  FALSE, 'TZS settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'UGX',  60,   2880,  FALSE, 'UGX settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'ZAR',  60,   2880,  FALSE, 'ZAR settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'XOF',  60,   2880,  FALSE, 'XOF settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'MWK',  60,   2880,  FALSE, 'MWK settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'RWF',  60,   2880,  FALSE, 'RWF settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'XAF',  60,   2880,  FALSE, 'XAF settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'ZMW',  60,   2880,  FALSE, 'ZMW settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'EGP',  60,   2880,  FALSE, 'EGP settles ~1h on Fincra. Withdrawal timeout: 48h.'),
    ('fincra', 'CNY',  1440, 4320,  FALSE, 'CNY settles T+1 on Fincra. Withdrawal timeout: 72h.'),
    ('fincra', 'CNH',  1440, 4320,  FALSE, 'CNH settles T+1 on Fincra. Withdrawal timeout: 72h.'),
    ('fincra', 'USDT', 0,    1440,  TRUE,  'USDT stablecoin via Fincra settles instantly. Withdrawal timeout: 24h.'),
    ('fincra', 'USDC', 0,    1440,  TRUE,  'USDC stablecoin via Fincra settles instantly. Withdrawal timeout: 24h.'),
    ('fincra', 'CNGN', 0,    1440,  TRUE,  'CNGN digital naira via Fincra settles instantly. Withdrawal timeout: 24h.')
ON CONFLICT (provider, currency) DO NOTHING;

-- RLS + auto-update
ALTER TABLE public.settlement_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_service_write ON public.settlement_policies
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY sp_anon_read ON public.settlement_policies
    FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.sp_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS sp_updated_at_trigger ON public.settlement_policies;
CREATE TRIGGER sp_updated_at_trigger
    BEFORE UPDATE ON public.settlement_policies
    FOR EACH ROW EXECUTE FUNCTION public.sp_set_updated_at();

-- ─── 5. RPCs ─────────────────────────────────────────────────────────────────

-- 5a. credit_pending_balance(wallet_id, amount)
-- Credits pending_balance ONLY. Does NOT touch available_balance or balance.
CREATE OR REPLACE FUNCTION public.credit_pending_balance(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'credit_pending_balance: amount must be positive, got %', p_amount;
    END IF;
    UPDATE public.wallets_store
    SET
        balance          = balance + p_amount,
        pending_balance  = pending_balance + p_amount,
        updated_at       = NOW()
    WHERE id = p_wallet_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'credit_pending_balance: wallet % not found', p_wallet_id;
    END IF;
END;
$$;

-- 5b. settle_pending_to_available(wallet_id, amount)
-- Moves amount from pending_balance → available_balance.
-- balance remains unchanged (it was already credited during pending).
CREATE OR REPLACE FUNCTION public.settle_pending_to_available(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_pending NUMERIC;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'settle_pending_to_available: amount must be positive, got %', p_amount;
    END IF;
    SELECT pending_balance INTO v_pending
    FROM public.wallets_store WHERE id = p_wallet_id FOR UPDATE;
    IF v_pending < p_amount THEN
        RAISE EXCEPTION 'settle_pending_to_available: insufficient pending balance. Has %, needs %', v_pending, p_amount;
    END IF;
    UPDATE public.wallets_store
    SET
        pending_balance   = pending_balance - p_amount,
        available_balance = available_balance + p_amount,
        updated_at        = NOW()
    WHERE id = p_wallet_id;
END;
$$;

-- 5c. credit_available_balance(wallet_id, amount)
-- Credits available_balance AND balance atomically (for instantly-settling deposits).
CREATE OR REPLACE FUNCTION public.credit_available_balance(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'credit_available_balance: amount must be positive, got %', p_amount;
    END IF;
    UPDATE public.wallets_store
    SET
        balance           = balance + p_amount,
        available_balance = available_balance + p_amount,
        updated_at        = NOW()
    WHERE id = p_wallet_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'credit_available_balance: wallet % not found', p_wallet_id;
    END IF;
END;
$$;

-- 5d. reserve_for_withdrawal(wallet_id, amount)
-- Moves amount from available_balance into reserved territory:
--   available_balance -= amount  (balance unchanged — funds still in platform)
-- Returns the new available_balance so callers can confirm.
CREATE OR REPLACE FUNCTION public.reserve_for_withdrawal(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_avail NUMERIC;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'reserve_for_withdrawal: amount must be positive, got %', p_amount;
    END IF;
    SELECT available_balance INTO v_avail
    FROM public.wallets_store WHERE id = p_wallet_id FOR UPDATE;
    IF v_avail < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE: Available %, Required %', v_avail, p_amount;
    END IF;
    UPDATE public.wallets_store
    SET
        available_balance = available_balance - p_amount,
        updated_at        = NOW()
    WHERE id = p_wallet_id;
    RETURN v_avail - p_amount;
END;
$$;

-- 5e. complete_withdrawal(wallet_id, amount)
-- Called after payout.successful webhook.
-- balance -= amount (the deduction is now permanent; available already decreased during reserve).
CREATE OR REPLACE FUNCTION public.complete_withdrawal(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'complete_withdrawal: amount must be positive, got %', p_amount;
    END IF;
    UPDATE public.wallets_store
    SET
        balance    = balance - p_amount,
        updated_at = NOW()
    WHERE id = p_wallet_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'complete_withdrawal: wallet % not found', p_wallet_id;
    END IF;
END;
$$;

-- 5f. reverse_withdrawal_reservation(wallet_id, amount)
-- Called after payout.failed or timeout.
-- Restores available_balance (balance unchanged — funds were never actually sent).
CREATE OR REPLACE FUNCTION public.reverse_withdrawal_reservation(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'reverse_withdrawal_reservation: amount must be positive, got %', p_amount;
    END IF;
    UPDATE public.wallets_store
    SET
        available_balance = available_balance + p_amount,
        updated_at        = NOW()
    WHERE id = p_wallet_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reverse_withdrawal_reservation: wallet % not found', p_wallet_id;
    END IF;
END;
$$;

-- 5g. get_settlement_policy(provider, currency)
-- Returns the settlement policy for a provider+currency. Falls back to provider default.
CREATE OR REPLACE FUNCTION public.get_settlement_policy(
    p_provider VARCHAR,
    p_currency VARCHAR
) RETURNS public.settlement_policies LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    v_policy public.settlement_policies;
BEGIN
    SELECT * INTO v_policy
    FROM public.settlement_policies
    WHERE provider = p_provider AND currency = p_currency;
    -- Return NULL if not found (caller handles the default)
    RETURN v_policy;
END;
$$;

COMMIT;
