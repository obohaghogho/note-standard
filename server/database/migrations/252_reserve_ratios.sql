-- ============================================================
-- Migration 252: Reserve Ratios
-- Purpose: Stores computed reserve ratios per currency after
--          each reconciliation cycle. Enables historical
--          reserve trending and threshold-based alerting.
-- Created: Enterprise Treasury Upgrade Phase 3
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.reserve_ratios (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    currency                VARCHAR(10)    NOT NULL,
    provider                VARCHAR(50)    NOT NULL,

    -- Asset side (external)
    external_available      NUMERIC(30, 8) NOT NULL DEFAULT 0,
    external_pending        NUMERIC(30, 8) NOT NULL DEFAULT 0,
    external_total          NUMERIC(30, 8) NOT NULL DEFAULT 0,

    -- Liability side (internal user wallets)
    internal_user_total     NUMERIC(30, 8) NOT NULL DEFAULT 0,
    internal_system_float   NUMERIC(30, 8) NOT NULL DEFAULT 0,
    net_user_liability      NUMERIC(30, 8) NOT NULL DEFAULT 0,

    -- Computed metrics
    reserve_ratio           NUMERIC(10, 4) NOT NULL DEFAULT 0,  -- e.g. 100.0000 = 100%
    reserve_surplus         NUMERIC(30, 8) NOT NULL DEFAULT 0,  -- positive = surplus, negative = deficit
    liquidity_ratio         NUMERIC(10, 4) NOT NULL DEFAULT 0,
    exposure_amount         NUMERIC(30, 8) NOT NULL DEFAULT 0,

    -- Status flags
    status                  VARCHAR(20)    NOT NULL DEFAULT 'OK', -- 'OK' | 'WARNING' | 'CRITICAL' | 'DEFICIT'
    alert_sent              BOOLEAN        NOT NULL DEFAULT FALSE,
    alert_level             VARCHAR(20),  -- 'INFO' | 'WARN' | 'CRITICAL'

    -- Calculation metadata
    calculation_method      VARCHAR(50)    NOT NULL DEFAULT 'SCHEDULED',
    snapshot_id             UUID REFERENCES public.treasury_balance_snapshots(id) ON DELETE SET NULL,

    -- Timestamps (append-only pattern)
    calculated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rr_currency       ON public.reserve_ratios(currency);
CREATE INDEX IF NOT EXISTS idx_rr_provider       ON public.reserve_ratios(provider);
CREATE INDEX IF NOT EXISTS idx_rr_status         ON public.reserve_ratios(status);
CREATE INDEX IF NOT EXISTS idx_rr_calculated_at  ON public.reserve_ratios(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rr_ratio          ON public.reserve_ratios(reserve_ratio);

-- Reserve ratio alert thresholds (configurable per currency)
CREATE TABLE IF NOT EXISTS public.reserve_thresholds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency        VARCHAR(10)    NOT NULL,
    warn_below      NUMERIC(6, 2)  NOT NULL DEFAULT 105.00,    -- Send WARN alert below 105%
    critical_below  NUMERIC(6, 2)  NOT NULL DEFAULT 100.00,    -- Send CRITICAL alert below 100%
    freeze_below    NUMERIC(6, 2)  NOT NULL DEFAULT 95.00,     -- Trigger SAFE_MODE below 95%
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rt_currency UNIQUE (currency)
);

-- Seed default thresholds for all supported currencies
INSERT INTO public.reserve_thresholds (currency, warn_below, critical_below, freeze_below)
VALUES
    ('NGN',  105.00, 100.00, 95.00),
    ('USD',  105.00, 100.00, 95.00),
    ('EUR',  105.00, 100.00, 95.00),
    ('GBP',  105.00, 100.00, 95.00),
    ('BTC',  110.00, 100.00, 95.00),
    ('ETH',  110.00, 100.00, 95.00),
    ('USDT', 105.00, 100.00, 95.00),
    ('USDC', 105.00, 100.00, 95.00)
ON CONFLICT (currency) DO NOTHING;

-- RLS
ALTER TABLE public.reserve_ratios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserve_thresholds  ENABLE ROW LEVEL SECURITY;

CREATE POLICY rr_service_all    ON public.reserve_ratios     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY rt_service_all    ON public.reserve_thresholds FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
