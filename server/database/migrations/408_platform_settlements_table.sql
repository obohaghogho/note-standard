-- ============================================================
-- Migration 408: Platform Revenue Settlements Table
-- Purpose: Dedicated table for NoteStandard's own earned platform
--          revenue settlements (the company settling its admin
--          fee income to its bank account via Fincra).
--
-- DISTINCT from public.settlements (Migration 253), which
-- tracks user deposit/withdrawal lifecycle stages using
-- the settlement_stage ENUM.
--
-- This table:
--  - tracks platform-to-company-bank payouts only
--  - uses a free-form VARCHAR status
--  - enforces UNIQUE(reference) to prevent duplicate payouts
--  - includes atomic reserve_platform_revenue() RPC that
--    checks availability and inserts the reservation in a
--    single serialisable transaction (fixes Race Condition)
--
-- Created: Controlled Repair Phase - Forensic Audit Blockers 1-4
-- ============================================================

BEGIN;

-- 1. Create platform_settlements table
CREATE TABLE IF NOT EXISTS public.platform_settlements (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Idempotency: admin-supplied reference, unique per payout
    reference            VARCHAR(200)   NOT NULL,
    CONSTRAINT platform_settlements_reference_key UNIQUE (reference),

    -- Amount and currency
    amount               NUMERIC(20, 4) NOT NULL CHECK (amount > 0),
    currency             VARCHAR(10)    NOT NULL,

    -- Status state machine:
    --   SIMULATED_TEST  - execution flag false; no real payout sent
    --   PENDING         - live flag true; record saved, payout queued
    --   PROCESSING      - Fincra payout.js called, awaiting webhook
    --   COMPLETED       - payout.successful webhook confirmed
    --   FAILED          - Fincra returned error or payout.failed webhook
    --   REVERSED        - Reservation reversed after timeout/failure
    status               VARCHAR(30)    NOT NULL DEFAULT 'PENDING',
    failure_reason       TEXT,

    -- Provider execution tracking
    provider             VARCHAR(50)    DEFAULT 'fincra',
    provider_reference   VARCHAR(200),
    fincra_reference     VARCHAR(200),

    -- Destination: server-side only, never caller-supplied
    destination_account  VARCHAR(200)   NOT NULL,

    -- Who requested it
    initiated_by         UUID           NOT NULL,

    -- Revenue snapshot at request time (for audit trail)
    available_at_request NUMERIC(20, 4),
    is_live_execution    BOOLEAN        NOT NULL DEFAULT false,

    -- Compliance audit trail
    metadata             JSONB          DEFAULT '{}'::jsonb,

    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ps_currency      ON public.platform_settlements(currency);
CREATE INDEX IF NOT EXISTS idx_ps_status        ON public.platform_settlements(status);
CREATE INDEX IF NOT EXISTS idx_ps_initiated     ON public.platform_settlements(initiated_by);
CREATE INDEX IF NOT EXISTS idx_ps_created       ON public.platform_settlements(created_at DESC);

-- 2. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.platform_settlements_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_settlements_updated_at ON public.platform_settlements;
CREATE TRIGGER platform_settlements_updated_at
    BEFORE UPDATE ON public.platform_settlements
    FOR EACH ROW EXECUTE FUNCTION public.platform_settlements_set_updated_at();

-- 3. Atomic revenue reservation RPC
-- Runs with row-level locking so two simultaneous settlement requests
-- for the same currency cannot both see the same available balance.
CREATE OR REPLACE FUNCTION public.reserve_platform_revenue(
    p_reference         VARCHAR,
    p_amount            NUMERIC,
    p_currency          VARCHAR,
    p_destination       VARCHAR,
    p_initiated_by      UUID,
    p_is_live           BOOLEAN,
    p_metadata          JSONB
)
RETURNS public.platform_settlements
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_revenue     NUMERIC := 0;
    v_total_reserved    NUMERIC := 0;
    v_available         NUMERIC := 0;
    v_record            public.platform_settlements;
    v_cur               VARCHAR := UPPER(p_currency);
    v_status            VARCHAR;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_SETTLEMENT_AMOUNT: Amount must be greater than zero.';
    END IF;

    -- Lock revenue_logs rows for this currency (prevents concurrent modification)
    PERFORM id
    FROM public.revenue_logs
    WHERE currency = v_cur
    FOR SHARE;

    -- Lock existing active platform_settlements for this currency
    -- (prevents a concurrent request from seeing stale available balance)
    PERFORM id
    FROM public.platform_settlements
    WHERE currency = v_cur
      AND status IN ('PENDING', 'PROCESSING', 'SIMULATED_TEST', 'PENDING_RECONCILIATION', 'COMPLETED')
    FOR UPDATE;

    -- Calculate total earned revenue
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_revenue
    FROM public.revenue_logs
    WHERE currency = v_cur;

    -- Calculate total already reserved or settled
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_reserved
    FROM public.platform_settlements
    WHERE currency = v_cur
      AND status IN ('PENDING', 'PROCESSING', 'SIMULATED_TEST', 'PENDING_RECONCILIATION', 'COMPLETED');

    v_available := v_total_revenue - v_total_reserved;

    IF v_available < p_amount THEN
        RAISE EXCEPTION
            'INSUFFICIENT_PLATFORM_REVENUE: Requested % % exceeds available % % (earned: %, reserved: %).',
            p_amount, v_cur, v_available, v_cur, v_total_revenue, v_total_reserved;
    END IF;

    IF p_is_live THEN
        v_status := 'PENDING';
    ELSE
        v_status := 'SIMULATED_TEST';
    END IF;

    INSERT INTO public.platform_settlements (
        reference,
        amount,
        currency,
        status,
        destination_account,
        initiated_by,
        is_live_execution,
        available_at_request,
        metadata
    )
    VALUES (
        p_reference,
        p_amount,
        v_cur,
        v_status,
        p_destination,
        p_initiated_by,
        p_is_live,
        v_available,
        p_metadata
    )
    RETURNING * INTO v_record;

    RETURN v_record;
END;
$$;

-- 4. Terminal state protection trigger
CREATE OR REPLACE FUNCTION public.platform_settlements_guard_terminal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'COMPLETED' AND NEW.status != 'COMPLETED' THEN
        RAISE EXCEPTION
            'ILLEGAL_STATUS_TRANSITION: Cannot move platform settlement % from COMPLETED to %.',
            OLD.id, NEW.status;
    END IF;
    IF OLD.status = 'FAILED' AND NEW.status NOT IN ('FAILED', 'REVERSED') THEN
        RAISE EXCEPTION
            'ILLEGAL_STATUS_TRANSITION: Cannot move platform settlement % from FAILED to %.',
            OLD.id, NEW.status;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_settlements_guard_terminal ON public.platform_settlements;
CREATE TRIGGER platform_settlements_guard_terminal
    BEFORE UPDATE ON public.platform_settlements
    FOR EACH ROW EXECUTE FUNCTION public.platform_settlements_guard_terminal();

-- 5. RLS
ALTER TABLE public.platform_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settlements_service ON public.platform_settlements;
CREATE POLICY platform_settlements_service
    ON public.platform_settlements
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;
