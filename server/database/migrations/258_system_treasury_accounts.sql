-- ============================================================
-- Migration 258: System Treasury Accounts
-- Purpose: Seeds the internal system-level ledger accounts
--          used for double-entry treasury operations.
--          All entries remain in wallets_store so the
--          existing execute_ledger_transaction_v6 RPC
--          handles them identically to user wallets.
-- Created: Enterprise Treasury Upgrade Phase 7
-- ============================================================

BEGIN;

-- NOTE: wallets_store has no unique constraint on (user_id, currency, network) as of migration 106
-- (it was dropped and replaced with unique_user_currency). The address column also cannot have a
-- unique index applied because earlier migrations inserted duplicate addresses under different
-- network values. We therefore use a WHERE NOT EXISTS guard — fully idempotent, constraint-free.

-- System treasury account types
-- These are special wallet addresses in wallets_store / wallets_v6
-- that represent internal treasury positions (not user funds).
--
-- Naming convention: SYSTEM_<PURPOSE>_<CURRENCY>
-- user_id is set to the superadmin account; falls back to zero UUID.

DO $$
DECLARE
    v_admin_id UUID;
    v_currencies TEXT[] := ARRAY['NGN','USD','EUR','GBP','BTC','ETH','USDT','USDC'];
    v_purposes   TEXT[] := ARRAY[
        'TREASURY',      -- Main treasury pool per currency
        'TRANSIT',       -- In-flight funds (already exists as SYSTEM_TRANSIT)
        'FEES',          -- Platform fee collection
        'COMMISSION',    -- Affiliate/partner commissions
        'PROVIDER_FLOAT',-- Funds held by provider pending settlement
        'RESERVE',       -- Regulatory reserve buffer
        'SETTLEMENT',    -- Settlement clearing account
        'LIQUIDITY',     -- Liquidity management buffer
        'ADJUSTMENTS'    -- Manual correction entries (admin use only)
    ];
    v_purpose TEXT;
    v_currency TEXT;
    v_address TEXT;
BEGIN
    -- Resolve a real user to satisfy wallets_store.user_id FK → auth.users.
    -- Priority: superadmin → any admin → any profile → skip seeding.
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'superadmin' LIMIT 1;
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    END IF;
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM public.profiles LIMIT 1;
    END IF;
    IF v_admin_id IS NULL THEN
        RAISE NOTICE 'Migration 258: No profile found to anchor system treasury wallets. Skipping seed.';
        RETURN;
    END IF;

    FOREACH v_purpose IN ARRAY v_purposes LOOP
        FOREACH v_currency IN ARRAY v_currencies LOOP
            v_address := 'SYSTEM_' || v_purpose || '_' || v_currency;

            INSERT INTO public.wallets_store (
                user_id,
                currency,
                network,
                address,
                provider
            )
            SELECT
                v_admin_id,
                v_currency,
                'SYSTEM',
                v_address,
                'internal'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.wallets_store
                WHERE address = v_address
                  AND network = 'SYSTEM'
            );

        END LOOP;
    END LOOP;
END $$;

-- Treasury system wallet configuration table
-- Tracks which wallet_id in wallets_store maps to which system purpose.
CREATE TABLE IF NOT EXISTS public.system_treasury_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose         VARCHAR(50)   NOT NULL,          -- 'TREASURY' | 'FEES' | 'COMMISSION' etc.
    currency        VARCHAR(10)   NOT NULL,
    wallet_id       UUID REFERENCES public.wallets_store(id) ON DELETE RESTRICT,
    address         VARCHAR(100)  NOT NULL UNIQUE,   -- SYSTEM_<PURPOSE>_<CURRENCY>
    description     TEXT,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sta_purpose_currency UNIQUE (purpose, currency)
);

-- Populate system_treasury_accounts from wallets_store
INSERT INTO public.system_treasury_accounts (purpose, currency, wallet_id, address, description)
SELECT
    split_part(ws.address, '_', 2)  AS purpose,
    split_part(ws.address, '_', 3)  AS currency,
    ws.id                           AS wallet_id,
    ws.address,
    'Auto-seeded system treasury account'
FROM public.wallets_store ws
WHERE ws.address LIKE 'SYSTEM_%_%'
  AND ws.network = 'SYSTEM'
ON CONFLICT (purpose, currency) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_sta_purpose    ON public.system_treasury_accounts(purpose);
CREATE INDEX IF NOT EXISTS idx_sta_currency   ON public.system_treasury_accounts(currency);

-- RLS
ALTER TABLE public.system_treasury_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY sta_service ON public.system_treasury_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
