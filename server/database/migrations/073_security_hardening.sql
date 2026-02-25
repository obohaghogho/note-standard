-- ============================================================================
-- Migration 073: SECURITY HARDENING (COMPLIANCE & PROTECTION)
-- ============================================================================
-- Purpose:
--   1. Strict RLS for Ledger and Wallets.
--   2. Daily Withdrawal Limits per user/plan.
--   3. 2FA Flag for sensitive operations.
--   4. Webhook Security reinforcement.
--   5. Security Audit Trail.
-- ============================================================================

BEGIN;

-- 1. ENHANCE PROFILES FOR SECURITY
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS two_factor_enabled    BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS daily_withdrawal_limit NUMERIC DEFAULT NULL, -- NULL = use plan default
    ADD COLUMN IF NOT EXISTS kyc_level              INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_verified            BOOLEAN DEFAULT false;

-- 2. CREATE SECURITY AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type  TEXT NOT NULL, -- 'LOGIN', '2FA_CHANGE', 'WITHDRAWAL_INIT', 'LARGE_TRANSFER', 'LIMIT_EXCEEDED'
    severity    TEXT DEFAULT 'INFO', -- 'INFO', 'WARN', 'CRITICAL'
    description TEXT,
    payload     JSONB,
    ip_address  TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_user ON public.security_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_type ON public.security_audit_logs(event_type);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see own security logs" ON public.security_audit_logs 
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));


-- 3. HARDEN RLS POLICIES (Strict Ownership)

-- A. WALLETS (Store)
ALTER TABLE public.wallets_store ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own wallets_store" ON public.wallets_store;
CREATE POLICY "Users can view own wallets_store" ON public.wallets_store
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- B. LEDGER ENTRIES
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own ledger" ON public.ledger_entries;
CREATE POLICY "Users can view own ledger" ON public.ledger_entries
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- C. WEBHOOK LOGS (Reinforce)
DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.webhook_logs;
CREATE POLICY "Admins can view webhook logs" ON public.webhook_logs
    FOR SELECT USING (is_admin(auth.uid()));

-- D. TRANSACTIONS (Reinforce)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));


-- 4. WITHDRAWAL LIMIT LOGIC

-- Helper to get user's daily limit
CREATE OR REPLACE FUNCTION public.get_user_withdrawal_limit(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_custom_limit NUMERIC;
    v_plan TEXT;
    v_plan_limits JSONB;
    v_limit NUMERIC;
BEGIN
    -- 1. Check for custom limit on profile
    SELECT daily_withdrawal_limit INTO v_custom_limit FROM public.profiles WHERE id = p_user_id;
    IF v_custom_limit IS NOT NULL THEN RETURN v_custom_limit; END IF;

    -- 2. Fallback to plan limits from admin_settings
    SELECT plan INTO v_plan FROM public.profiles WHERE id = p_user_id;
    SELECT value INTO v_plan_limits FROM public.admin_settings WHERE key = 'daily_limits';
    
    v_limit := (v_plan_limits->>v_plan)::NUMERIC;
    RETURN COALESCE(v_limit, 1000); -- Default to 1000 if nothing else found
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to calculate total withdrawn in last 24h (USD equivalent or raw amount)
-- For simplicity, we'll sum the raw amounts in the same currency or provide a base currency sum.
-- Here we'll just sum the requested currency.
CREATE OR REPLACE FUNCTION public.get_daily_withdrawal_total(p_user_id UUID, p_currency TEXT)
RETURNS NUMERIC AS $$
    SELECT COALESCE(SUM(ABS(amount)), 0)
    FROM public.ledger_entries
    WHERE user_id = p_user_id 
      AND (type = 'withdrawal' OR type = 'payout')
      AND currency = p_currency
      AND status != 'failed'
      AND created_at > (NOW() - INTERVAL '24 hours');
$$ LANGUAGE SQL STABLE SECURITY DEFINER;


-- 5. UPGRADED WITHDRAW_FUNDS (With Limit & 2FA Enforcement)
CREATE OR REPLACE FUNCTION public.withdraw_funds_secured(
    p_wallet_id          UUID, 
    p_amount             NUMERIC, 
    p_currency           TEXT, 
    p_fee                NUMERIC, 
    p_rate               NUMERIC, 
    p_platform_wallet_id UUID, 
    p_idempotency_key    TEXT DEFAULT NULL,
    p_metadata           JSONB DEFAULT '{}',
    p_2fa_verified       BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_user_id UUID;
    v_available NUMERIC;
    v_limit NUMERIC;
    v_current_total NUMERIC;
    v_2fa_req BOOLEAN;
BEGIN
    -- 1. Basic Validation
    SELECT user_id INTO v_user_id FROM public.wallets_store WHERE id = p_wallet_id;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    -- 2. 2FA Enforcement
    SELECT two_factor_enabled INTO v_2fa_req FROM public.profiles WHERE id = v_user_id;
    IF v_2fa_req AND NOT p_2fa_verified THEN
        -- Log suspicious attempt
        INSERT INTO public.security_audit_logs (user_id, event_type, severity, description)
        VALUES (v_user_id, 'WITHDRAW_2FA_FAIL', 'WARN', 'Withdrawal attempted without 2FA verification');
        RAISE EXCEPTION '2FA_REQUIRED';
    END IF;

    -- 3. Daily Limit Enforcement
    v_limit := public.get_user_withdrawal_limit(v_user_id);
    v_current_total := public.get_daily_withdrawal_total(v_user_id, p_currency);
    
    IF (v_current_total + p_amount) > v_limit THEN
        INSERT INTO public.security_audit_logs (user_id, event_type, severity, description, payload)
        VALUES (v_user_id, 'LIMIT_EXCEEDED', 'WARN', 'Withdrawal limit exceeded', jsonb_build_object('limit', v_limit, 'attempted', p_amount, 'current', v_current_total));
        RAISE EXCEPTION 'DAILY_LIMIT_EXCEEDED (Limit: %, Current Total: %)', v_limit, v_current_total;
    END IF;

    -- 4. Execute legacy withdraw logic (re-using atomic logic from Migration 072)
    -- We can just call it or inline it. Since it's atomic, we'll inline a hardened version.
    
    -- Lock wallet
    PERFORM 1 FROM public.wallets_store WHERE id = p_wallet_id FOR UPDATE;

    v_available := public.get_wallet_available_balance(p_wallet_id);
    IF v_available < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds (Available: %, Required: %)', v_available, (p_amount + p_fee);
    END IF;

    -- Create transaction
    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency,
        amount_from, amount_to, status, fee, rate,
        display_label, category, provider, idempotency_key, metadata, created_at, completed_at
    ) VALUES (
        v_user_id, p_wallet_id, 'withdrawal', p_currency, p_currency,
        p_amount, p_amount, 'COMPLETED', p_fee, p_rate,
        'Withdrawal', 'withdrawal', 'internal', p_idempotency_key, p_metadata, NOW(), NOW()
    ) RETURNING id INTO v_tx_id;

    -- Ledger Entries
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference)
    VALUES (v_user_id, p_wallet_id, p_currency, -(p_amount + p_fee), 'withdrawal', v_tx_id);

    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference)
        VALUES ((SELECT user_id FROM public.wallets_store WHERE id = p_platform_wallet_id), p_platform_wallet_id, p_currency, p_fee, 'fee', v_tx_id);
    END IF;

    -- Audit log success
    INSERT INTO public.security_audit_logs (user_id, event_type, severity, description, payload)
    VALUES (v_user_id, 'WITHDRAWAL_SUCCESS', 'INFO', 'Withdrawal processed', jsonb_build_object('amount', p_amount, 'currency', p_currency, 'tx_id', v_tx_id));

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. AUDIT TRAIL TRIGGER
-- Log all manual credits/debits by system/admin
CREATE OR REPLACE FUNCTION public.trg_ledger_audit_fn()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.type IN ('system_credit', 'adjustment', 'fee')) THEN
        INSERT INTO public.security_audit_logs (user_id, event_type, severity, description, payload)
        VALUES (NEW.user_id, 'LEDGER_ADJUSTMENT', 'INFO', 'Ledger adjustment recorded: ' || NEW.type, row_to_json(NEW)::jsonb);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ledger_audit ON public.ledger_entries;
CREATE TRIGGER trg_ledger_audit AFTER INSERT ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.trg_ledger_audit_fn();

COMMIT;
