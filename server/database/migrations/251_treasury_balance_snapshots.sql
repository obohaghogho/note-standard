-- ============================================================
-- Migration 251: Treasury Balance Snapshots
-- Purpose: Immutable append-only history of every provider
--          balance sync. Never updated or deleted. Enables
--          point-in-time reserve analysis and audit trails.
-- Created: Enterprise Treasury Upgrade Phase 2
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.treasury_balance_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What was captured
    provider            VARCHAR(50)   NOT NULL,
    currency            VARCHAR(10)   NOT NULL,
    snapshot_type       VARCHAR(30)   NOT NULL DEFAULT 'SCHEDULED', -- 'SCHEDULED' | 'MANUAL' | 'TRIGGERED' | 'BOOT'

    -- Provider-side balances at snapshot time
    available_balance   NUMERIC(30, 8) NOT NULL DEFAULT 0,
    pending_balance     NUMERIC(30, 8) NOT NULL DEFAULT 0,
    reserved_balance    NUMERIC(30, 8) NOT NULL DEFAULT 0,
    locked_balance      NUMERIC(30, 8) NOT NULL DEFAULT 0,

    -- Internal ledger totals at the same instant (for inline comparison)
    internal_user_liability NUMERIC(30, 8) NOT NULL DEFAULT 0,  -- sum of user wallets (excluding SYSTEM wallets)
    internal_system_float   NUMERIC(30, 8) NOT NULL DEFAULT 0,  -- sum of SYSTEM_TRANSIT wallets

    -- Computed diff at snapshot time
    reserve_difference  NUMERIC(30, 8) GENERATED ALWAYS AS (available_balance - internal_user_liability) STORED,
    reserve_ratio       NUMERIC(10, 6) GENERATED ALWAYS AS (
        CASE WHEN internal_user_liability > 0
             THEN ROUND((available_balance / internal_user_liability) * 100, 4)
             ELSE 100.0000
        END
    ) STORED,

    -- Metadata
    sync_latency_ms     INTEGER,          -- Time it took to fetch from provider
    raw_response        JSONB,            -- Full provider API response (for audit)
    triggered_by        VARCHAR(100),     -- 'scheduler' | 'admin:<userId>' | 'alert'
    notes               TEXT,

    -- Immutable timestamp — never updated
    captured_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for time-series queries
CREATE INDEX IF NOT EXISTS idx_tbs_provider_currency ON public.treasury_balance_snapshots(provider, currency);
CREATE INDEX IF NOT EXISTS idx_tbs_captured_at       ON public.treasury_balance_snapshots(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_tbs_ratio             ON public.treasury_balance_snapshots(reserve_ratio);
CREATE INDEX IF NOT EXISTS idx_tbs_snapshot_type     ON public.treasury_balance_snapshots(snapshot_type);

-- IMMUTABILITY: Block all UPDATE and DELETE via trigger
CREATE OR REPLACE FUNCTION public.deny_snapshot_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'treasury_balance_snapshots is append-only. Mutation denied. (operation: %)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS tbs_deny_update ON public.treasury_balance_snapshots;
CREATE TRIGGER tbs_deny_update
    BEFORE UPDATE ON public.treasury_balance_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.deny_snapshot_mutation();

DROP TRIGGER IF EXISTS tbs_deny_delete ON public.treasury_balance_snapshots;
CREATE TRIGGER tbs_deny_delete
    BEFORE DELETE ON public.treasury_balance_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.deny_snapshot_mutation();

-- RLS
ALTER TABLE public.treasury_balance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tbs_service_insert ON public.treasury_balance_snapshots
    FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY tbs_service_select ON public.treasury_balance_snapshots
    FOR SELECT TO service_role USING (true);

COMMIT;
