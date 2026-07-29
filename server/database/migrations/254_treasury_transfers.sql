-- ============================================================
-- Migration 254: Treasury Transfers
-- Purpose: Tracks inter-provider treasury movements (e.g.
--          Fincra → Grey, NOWPayments → Cold Wallet).
--          All movements require human approval before
--          execution. Full audit trail enforced.
-- Created: Enterprise Treasury Upgrade Phase 8
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.treasury_transfers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Transfer details
    source_provider     VARCHAR(50)    NOT NULL,
    target_provider     VARCHAR(50)    NOT NULL,
    currency            VARCHAR(10)    NOT NULL,
    amount              NUMERIC(30, 8) NOT NULL CHECK (amount > 0),
    reference           VARCHAR(150)   NOT NULL UNIQUE DEFAULT ('TREAS_' || gen_random_uuid()::TEXT),

    -- Classification
    transfer_type       VARCHAR(30)    NOT NULL DEFAULT 'REBALANCE',
    -- 'REBALANCE' | 'SETTLEMENT' | 'LIQUIDITY' | 'RESERVE' | 'EMERGENCY'

    -- Status lifecycle
    status              VARCHAR(30)    NOT NULL DEFAULT 'PENDING_APPROVAL',
    -- 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

    -- Approval workflow (MANDATORY — never auto-execute)
    requested_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    requested_reason    TEXT           NOT NULL,
    approved_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at         TIMESTAMP WITH TIME ZONE,
    approval_notes      TEXT,
    cancelled_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_at        TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,

    -- Execution details
    external_reference  VARCHAR(150),   -- Provider-side reference after execution
    execution_response  JSONB,          -- Raw provider API response
    execution_error     TEXT,
    executed_at         TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tt_status        ON public.treasury_transfers(status);
CREATE INDEX IF NOT EXISTS idx_tt_currency      ON public.treasury_transfers(currency);
CREATE INDEX IF NOT EXISTS idx_tt_created_at    ON public.treasury_transfers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tt_requested_by  ON public.treasury_transfers(requested_by);
CREATE INDEX IF NOT EXISTS idx_tt_reference     ON public.treasury_transfers(reference);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.tt_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tt_updated_at ON public.treasury_transfers;
CREATE TRIGGER tt_updated_at
    BEFORE UPDATE ON public.treasury_transfers
    FOR EACH ROW EXECUTE FUNCTION public.tt_set_updated_at();

-- Safety: prevent direct-to-EXECUTING transitions without approval
CREATE OR REPLACE FUNCTION public.enforce_treasury_transfer_approval()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'EXECUTING' AND (OLD.approved_by IS NULL OR OLD.approved_at IS NULL) THEN
        RAISE EXCEPTION 'Cannot execute treasury transfer without prior approval. Transfer ID: %', NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tt_enforce_approval ON public.treasury_transfers;
CREATE TRIGGER tt_enforce_approval
    BEFORE UPDATE OF status ON public.treasury_transfers
    FOR EACH ROW EXECUTE FUNCTION public.enforce_treasury_transfer_approval();

-- RLS
ALTER TABLE public.treasury_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tt_service_all ON public.treasury_transfers FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
