-- ============================================================
-- Migration 257: Provider Health Metrics
-- Purpose: Tracks per-provider API health over time.
--          Written by ProviderHealthWorker on every probe.
--          Enables circuit breaker decisions and dashboards.
-- Created: Enterprise Treasury Upgrade Phase 9
-- ============================================================

BEGIN;

-- Current health state (one row per provider — updated in place)
CREATE TABLE IF NOT EXISTS public.provider_health_status (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider            VARCHAR(50)   NOT NULL UNIQUE,

    -- Health classification
    status              VARCHAR(20)   NOT NULL DEFAULT 'UNKNOWN',
    -- 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN' | 'MAINTENANCE'

    -- Circuit breaker
    circuit_breaker     VARCHAR(20)   NOT NULL DEFAULT 'CLOSED',
    -- 'CLOSED' (normal) | 'OPEN' (blocking) | 'HALF_OPEN' (testing)
    circuit_opened_at   TIMESTAMP WITH TIME ZONE,
    circuit_reason      TEXT,
    consecutive_failures INTEGER       NOT NULL DEFAULT 0,
    failure_threshold   INTEGER        NOT NULL DEFAULT 5,

    -- Latency metrics (rolling 5-min window)
    avg_latency_ms      INTEGER        NOT NULL DEFAULT 0,
    p95_latency_ms      INTEGER        NOT NULL DEFAULT 0,
    p99_latency_ms      INTEGER        NOT NULL DEFAULT 0,
    min_latency_ms      INTEGER        NOT NULL DEFAULT 0,
    max_latency_ms      INTEGER        NOT NULL DEFAULT 0,

    -- Success/failure rates (rolling 1-hour window)
    total_requests      INTEGER        NOT NULL DEFAULT 0,
    successful_requests INTEGER        NOT NULL DEFAULT 0,
    failed_requests     INTEGER        NOT NULL DEFAULT 0,
    timeout_requests    INTEGER        NOT NULL DEFAULT 0,
    rate_limited_count  INTEGER        NOT NULL DEFAULT 0,
    success_rate        NUMERIC(5, 2)  NOT NULL DEFAULT 100.00,   -- 0.00 to 100.00

    -- Webhook health
    last_webhook_at     TIMESTAMP WITH TIME ZONE,
    webhook_delay_ms    INTEGER,
    webhooks_received   INTEGER        NOT NULL DEFAULT 0,
    webhooks_failed     INTEGER        NOT NULL DEFAULT 0,

    -- Balance sync health
    last_balance_sync_at TIMESTAMP WITH TIME ZONE,
    balance_sync_failures INTEGER      NOT NULL DEFAULT 0,

    -- Timestamps
    last_probe_at       TIMESTAMP WITH TIME ZONE,
    last_healthy_at     TIMESTAMP WITH TIME ZONE,
    last_failure_at     TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.phs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phs_updated_at ON public.provider_health_status;
CREATE TRIGGER phs_updated_at
    BEFORE UPDATE ON public.provider_health_status
    FOR EACH ROW EXECUTE FUNCTION public.phs_set_updated_at();

-- Historical probes (append-only for time-series analysis)
CREATE TABLE IF NOT EXISTS public.provider_health_probes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        VARCHAR(50)   NOT NULL,
    probe_type      VARCHAR(30)   NOT NULL DEFAULT 'PING',
    -- 'PING' | 'BALANCE_FETCH' | 'WEBHOOK_CHECK' | 'FULL_HEALTH'
    status          VARCHAR(20)   NOT NULL,
    latency_ms      INTEGER,
    http_status     INTEGER,
    error_message   TEXT,
    metadata        JSONB         DEFAULT '{}'::jsonb,
    probed_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_php_provider      ON public.provider_health_probes(provider);
CREATE INDEX IF NOT EXISTS idx_php_probed_at     ON public.provider_health_probes(probed_at DESC);
CREATE INDEX IF NOT EXISTS idx_php_status        ON public.provider_health_probes(status);

-- Seed initial status rows
INSERT INTO public.provider_health_status (provider, status, circuit_breaker)
VALUES
    ('fincra',      'UNKNOWN', 'CLOSED'),
    ('paystack',    'UNKNOWN', 'CLOSED'),
    ('nowpayments', 'UNKNOWN', 'CLOSED'),
    ('grey',        'UNKNOWN', 'CLOSED'),
    ('anchor',      'UNKNOWN', 'CLOSED'),
    ('stripe',      'UNKNOWN', 'CLOSED'),
    ('flutterwave', 'UNKNOWN', 'CLOSED')
ON CONFLICT (provider) DO NOTHING;

-- Liquidity recommendations log
CREATE TABLE IF NOT EXISTS public.liquidity_recommendations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency            VARCHAR(10)     NOT NULL,
    provider            VARCHAR(50),
    recommendation_type VARCHAR(50)     NOT NULL,
    -- 'TOP_UP_PROVIDER' | 'MOVE_FUNDS' | 'REDUCE_EXPOSURE' | 'FREEZE_WITHDRAWALS'
    -- 'ENABLE_SAFE_MODE' | 'REBALANCE_REQUIRED' | 'LIQUIDITY_GAP'
    severity            VARCHAR(20)     NOT NULL DEFAULT 'INFO',
    -- 'INFO' | 'WARN' | 'CRITICAL'
    title               VARCHAR(200)    NOT NULL,
    description         TEXT,
    -- Quantified data
    current_available   NUMERIC(30, 8),
    required_amount     NUMERIC(30, 8),
    gap_amount          NUMERIC(30, 8),
    -- Action tracking
    status              VARCHAR(20)     NOT NULL DEFAULT 'OPEN',
    -- 'OPEN' | 'ACTIONED' | 'RESOLVED' | 'DISMISSED'
    actioned_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actioned_at         TIMESTAMP WITH TIME ZONE,
    resolved_at         TIMESTAMP WITH TIME ZONE,
    -- Timestamps
    generated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lr_currency    ON public.liquidity_recommendations(currency);
CREATE INDEX IF NOT EXISTS idx_lr_severity    ON public.liquidity_recommendations(severity);
CREATE INDEX IF NOT EXISTS idx_lr_status      ON public.liquidity_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_lr_generated   ON public.liquidity_recommendations(generated_at DESC);

-- RLS
ALTER TABLE public.provider_health_status   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_health_probes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidity_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY phs_service  ON public.provider_health_status    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY php_service  ON public.provider_health_probes    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY lr_service   ON public.liquidity_recommendations  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
