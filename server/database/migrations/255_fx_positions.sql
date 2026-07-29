-- ============================================================
-- Migration 255: FX Positions
-- Purpose: Records every FX swap execution for P&L tracking.
--          Written AFTER the atomic swap RPC completes.
--          Supports realized P&L reporting and exposure mgmt.
-- Created: Enterprise Treasury Upgrade Phase 11
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.fx_positions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links to the originating swap
    swap_quote_id       UUID,            -- References swap_quotes if available
    transaction_id      UUID REFERENCES public.transactions(id) ON DELETE RESTRICT,
    idempotency_key     VARCHAR(200)    UNIQUE,

    -- Currencies involved
    from_currency       VARCHAR(10)     NOT NULL,
    to_currency         VARCHAR(10)     NOT NULL,

    -- Amounts
    from_amount         NUMERIC(30, 8)  NOT NULL,
    to_amount           NUMERIC(30, 8)  NOT NULL,
    fee_amount          NUMERIC(30, 8)  NOT NULL DEFAULT 0,
    net_from_amount     NUMERIC(30, 8)  NOT NULL,

    -- Rate & pricing metadata
    execution_rate      NUMERIC(20, 10) NOT NULL,        -- Rate used for execution
    market_rate         NUMERIC(20, 10),                 -- Mid-market rate at time of trade
    spread              NUMERIC(20, 10),                 -- execution_rate - market_rate
    spread_bps          NUMERIC(10, 4),                  -- Spread in basis points
    platform_margin     NUMERIC(10, 4),                  -- Platform's take on the spread (bps)
    slippage            NUMERIC(10, 6),                  -- Actual vs. quoted rate deviation

    -- Rate source traceability
    rate_source         VARCHAR(50),                     -- 'coingecko' | 'exchangerate_api' | 'manual'
    rate_snapshot_id    UUID,                            -- References market_snapshots if applicable
    rate_confidence     NUMERIC(5, 4),                  -- 0.0 to 1.0
    rate_mode           VARCHAR(30),                     -- 'LIVE' | 'LKG' | 'FALLBACK'
    price_age_seconds   INTEGER,

    -- P&L (computed from cost basis vs. current market)
    cost_basis_usd      NUMERIC(20, 8),                  -- USD equivalent at trade time
    realized_pnl_usd    NUMERIC(20, 8),                  -- For completed close-out trades
    unrealized_pnl_usd  NUMERIC(20, 8),                  -- Calculated on demand by FXTreasuryEngine

    -- Classification
    position_type       VARCHAR(20)     NOT NULL DEFAULT 'CUSTOMER_SWAP',
    -- 'CUSTOMER_SWAP' | 'TREASURY_HEDGE' | 'REBALANCE' | 'FEE_COLLECTION'

    -- User context (for per-user P&L if needed)
    user_id             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    -- Timestamps
    executed_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fx_from_currency ON public.fx_positions(from_currency);
CREATE INDEX IF NOT EXISTS idx_fx_to_currency   ON public.fx_positions(to_currency);
CREATE INDEX IF NOT EXISTS idx_fx_executed_at   ON public.fx_positions(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fx_user_id       ON public.fx_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_fx_type          ON public.fx_positions(position_type);

-- FX exposure summary view (refreshed on demand by FXTreasuryEngine)
CREATE TABLE IF NOT EXISTS public.fx_exposure_summary (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_pair   VARCHAR(20)    NOT NULL,              -- 'NGN/USD' etc.
    net_position    NUMERIC(30, 8) NOT NULL DEFAULT 0,
    total_volume    NUMERIC(30, 8) NOT NULL DEFAULT 0,
    avg_rate        NUMERIC(20, 10) NOT NULL DEFAULT 0,
    realized_pnl    NUMERIC(20, 8) NOT NULL DEFAULT 0,
    unrealized_pnl  NUMERIC(20, 8) NOT NULL DEFAULT 0,
    trade_count     INTEGER        NOT NULL DEFAULT 0,
    last_trade_at   TIMESTAMP WITH TIME ZONE,
    summary_date    DATE           NOT NULL DEFAULT CURRENT_DATE,
    calculated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fx_exposure_pair_date UNIQUE (currency_pair, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_fxes_pair    ON public.fx_exposure_summary(currency_pair);
CREATE INDEX IF NOT EXISTS idx_fxes_date    ON public.fx_exposure_summary(summary_date DESC);

-- RLS
ALTER TABLE public.fx_positions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_exposure_summary  ENABLE ROW LEVEL SECURITY;

CREATE POLICY fx_service_all    ON public.fx_positions        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fxes_service_all  ON public.fx_exposure_summary FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
