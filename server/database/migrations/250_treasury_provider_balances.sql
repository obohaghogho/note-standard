-- ============================================================
-- Migration 250: Treasury Provider Balances
-- Purpose: Stores the most-recent known balance from each
--          external payment provider per currency. This is the
--          "external assets" side of the reserve equation.
--          Updated by TreasuryBalanceSyncWorker on each sync cycle.
-- Created: Enterprise Treasury Upgrade Phase 1
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.treasury_provider_balances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider identification
    provider            VARCHAR(50)   NOT NULL,          -- 'fincra' | 'paystack' | 'nowpayments' | 'grey'
    currency            VARCHAR(10)   NOT NULL,          -- 'NGN' | 'USD' | 'EUR' | 'BTC' | 'USDT' etc.

    -- Balance breakdown
    available_balance   NUMERIC(30, 8) NOT NULL DEFAULT 0,
    pending_balance     NUMERIC(30, 8) NOT NULL DEFAULT 0,
    reserved_balance    NUMERIC(30, 8) NOT NULL DEFAULT 0,
    locked_balance      NUMERIC(30, 8) NOT NULL DEFAULT 0,
    ledger_balance      NUMERIC(30, 8) NOT NULL DEFAULT 0, -- total including pending

    -- Provider status at time of last sync
    provider_status     VARCHAR(20)   NOT NULL DEFAULT 'UNKNOWN',  -- 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'
    sync_status         VARCHAR(20)   NOT NULL DEFAULT 'PENDING',  -- 'SUCCESS' | 'FAILED' | 'PENDING' | 'STALE'
    sync_error          TEXT,

    -- Timestamps
    last_sync_at        TIMESTAMP WITH TIME ZONE,
    next_sync_at        TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Optimistic concurrency — incremented on every update
    version             INTEGER NOT NULL DEFAULT 1,

    -- One live row per provider + currency
    CONSTRAINT uq_treasury_provider_currency UNIQUE (provider, currency)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tpb_provider   ON public.treasury_provider_balances(provider);
CREATE INDEX IF NOT EXISTS idx_tpb_currency   ON public.treasury_provider_balances(currency);
CREATE INDEX IF NOT EXISTS idx_tpb_sync_at    ON public.treasury_provider_balances(last_sync_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpb_status     ON public.treasury_provider_balances(sync_status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.tpb_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version    = OLD.version + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tpb_updated_at_trigger ON public.treasury_provider_balances;
CREATE TRIGGER tpb_updated_at_trigger
    BEFORE UPDATE ON public.treasury_provider_balances
    FOR EACH ROW EXECUTE FUNCTION public.tpb_set_updated_at();

-- RLS
ALTER TABLE public.treasury_provider_balances ENABLE ROW LEVEL SECURITY;

-- Only service_role can write; superadmin can read
CREATE POLICY tpb_service_write ON public.treasury_provider_balances
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed initial placeholder rows so the sync worker has targets to UPDATE
INSERT INTO public.treasury_provider_balances (provider, currency, sync_status)
SELECT provider, currency, 'PENDING'
FROM (VALUES
    ('fincra',       'NGN'),
    ('fincra',       'USD'),
    ('fincra',       'EUR'),
    ('fincra',       'GBP'),
    ('paystack',     'NGN'),
    ('nowpayments',  'BTC'),
    ('nowpayments',  'ETH'),
    ('nowpayments',  'USDT'),
    ('nowpayments',  'USDC'),
    ('grey',         'USD'),
    ('grey',         'EUR'),
    ('grey',         'GBP')
) AS t(provider, currency)
ON CONFLICT (provider, currency) DO NOTHING;

COMMIT;
