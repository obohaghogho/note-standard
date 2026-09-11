-- ============================================================================
-- Migration 464: Auto-Credit Limit Configuration for Manual Deposits
-- ============================================================================
-- Purpose:
--   Introduce a configurable "auto_credit_limit" in admin_settings.
--   - Deposits at or below this limit are credited automatically without
--     requiring admin approval.
--   - Deposits ABOVE this limit are flagged as "pending_admin_review" and
--     require explicit admin approval before the wallet is credited.
--
-- Default limit: 50,000 NGN (or equivalent in other currencies)
-- ============================================================================

BEGIN;

-- ─── 1. Ensure admin_settings table exists ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    description TEXT,
    updated_by  UUID,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure description column exists even if table was created by older migrations
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS admin_settings_service ON public.admin_settings;
DROP POLICY IF EXISTS admin_settings_admin_read ON public.admin_settings;

CREATE POLICY admin_settings_service ON public.admin_settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY admin_settings_admin_read ON public.admin_settings
    FOR SELECT TO authenticated
    USING ((SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) IN ('admin', 'superadmin'));

-- ─── 2. Seed the auto_credit_limit setting ───────────────────────────────────
INSERT INTO public.admin_settings (key, value)
VALUES (
    'deposit_auto_credit_config',
    jsonb_build_object(
        'enabled',          true,
        'limit_ngn',        50000,
        'limit_usd',        50,
        'limit_eur',        50,
        'limit_gbp',        40,
        'require_proof',    true,
        'notify_admin_on_high', true,
        'description', 'Deposits at or below the limit are auto-credited. Above the limit requires admin approval.'
    )
)
ON CONFLICT (key) DO UPDATE
    SET value      = EXCLUDED.value,
        updated_at = NOW();

-- ─── 3. Helper RPC: get_auto_credit_limit(currency) ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_auto_credit_limit(p_currency TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
    v_config JSONB;
    v_key    TEXT;
    v_limit  NUMERIC;
BEGIN
    SELECT value INTO v_config
    FROM public.admin_settings
    WHERE key = 'deposit_auto_credit_config';

    -- If disabled, return 0 (always require admin approval)
    IF v_config IS NULL OR NOT (v_config->>'enabled')::BOOLEAN THEN
        RETURN 0;
    END IF;

    v_key := 'limit_' || LOWER(p_currency);
    v_limit := (v_config->>v_key)::NUMERIC;

    -- Default to 0 (require admin approval) if currency not configured
    RETURN COALESCE(v_limit, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_auto_credit_limit(TEXT) TO service_role, authenticated;

-- ─── 4. Add wallet_credit_status to manual_deposits if not present ───────────
ALTER TABLE public.manual_deposits
    ADD COLUMN IF NOT EXISTS wallet_credited     BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS credited_tx_id      UUID,
    ADD COLUMN IF NOT EXISTS auto_credit_applied BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS review_reason       TEXT;

-- Index for fast admin queue lookups
CREATE INDEX IF NOT EXISTS idx_manual_deposits_status_credited
    ON public.manual_deposits(status, wallet_credited);

COMMIT;
