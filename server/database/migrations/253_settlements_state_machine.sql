-- ============================================================
-- Migration 253: Settlement State Machine
-- Purpose: Tracks every payment through a formal 7-stage
--          lifecycle from INITIATED through ARCHIVED.
--          Payments may never skip a stage. Every stage
--          transition is immutably recorded.
-- Created: Enterprise Treasury Upgrade Phase 6
-- ============================================================

BEGIN;

-- Settlement status enum
DO $$ BEGIN
    CREATE TYPE public.settlement_stage AS ENUM (
        'INITIATED',
        'PROVIDER_PENDING',
        'PROVIDER_CONFIRMED',
        'LEDGER_POSTED',
        'TREASURY_VERIFIED',
        'SETTLED',
        'ARCHIVED',
        'FAILED',
        'REVERSED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Main settlements table
CREATE TABLE IF NOT EXISTS public.settlements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links to existing records — never orphaned
    transaction_id      UUID REFERENCES public.transactions(id) ON DELETE RESTRICT,
    reference           VARCHAR(150)   NOT NULL,
    external_reference  VARCHAR(150),                            -- Provider's own reference

    -- Classification
    settlement_type     VARCHAR(30)    NOT NULL,                 -- 'DEPOSIT' | 'WITHDRAWAL' | 'SWAP' | 'TRANSFER'
    direction           VARCHAR(10)    NOT NULL,                 -- 'INBOUND' | 'OUTBOUND'
    provider            VARCHAR(50),
    currency            VARCHAR(10)    NOT NULL,
    amount              NUMERIC(30, 8) NOT NULL,
    fee_amount          NUMERIC(30, 8) NOT NULL DEFAULT 0,
    net_amount          NUMERIC(30, 8) NOT NULL DEFAULT 0,

    -- State machine
    current_stage       public.settlement_stage NOT NULL DEFAULT 'INITIATED',
    previous_stage      public.settlement_stage,
    failure_reason      TEXT,

    -- Treasury verification details
    treasury_verified_at    TIMESTAMP WITH TIME ZONE,
    treasury_verified_by    VARCHAR(100),   -- 'TreasuryBalanceSyncWorker' | 'admin:<id>'
    reserve_ratio_at_settlement NUMERIC(10, 4),

    -- Timestamps
    initiated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    provider_confirmed_at   TIMESTAMP WITH TIME ZONE,
    ledger_posted_at    TIMESTAMP WITH TIME ZONE,
    settled_at          TIMESTAMP WITH TIME ZONE,
    archived_at         TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_reference    ON public.settlements(reference);
CREATE INDEX IF NOT EXISTS idx_settlements_tx_id        ON public.settlements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_settlements_stage        ON public.settlements(current_stage);
CREATE INDEX IF NOT EXISTS idx_settlements_type         ON public.settlements(settlement_type);
CREATE INDEX IF NOT EXISTS idx_settlements_currency     ON public.settlements(currency);
CREATE INDEX IF NOT EXISTS idx_settlements_created      ON public.settlements(created_at DESC);

-- Settlement stage transitions log (immutable audit trail)
CREATE TABLE IF NOT EXISTS public.settlement_transitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id   UUID NOT NULL REFERENCES public.settlements(id) ON DELETE RESTRICT,
    from_stage      public.settlement_stage,
    to_stage        public.settlement_stage NOT NULL,
    transitioned_by VARCHAR(100),    -- 'worker:TreasuryBalanceSyncWorker' | 'admin:<id>' | 'webhook'
    notes           TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,
    transitioned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_st_settlement_id ON public.settlement_transitions(settlement_id);
CREATE INDEX IF NOT EXISTS idx_st_at            ON public.settlement_transitions(transitioned_at DESC);

-- IMMUTABILITY for transitions
CREATE OR REPLACE FUNCTION public.deny_settlement_transition_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'settlement_transitions is append-only. Mutation denied.';
END;
$$;

DROP TRIGGER IF EXISTS st_deny_update ON public.settlement_transitions;
CREATE TRIGGER st_deny_update
    BEFORE UPDATE ON public.settlement_transitions
    FOR EACH ROW EXECUTE FUNCTION public.deny_settlement_transition_mutation();

DROP TRIGGER IF EXISTS st_deny_delete ON public.settlement_transitions;
CREATE TRIGGER st_deny_delete
    BEFORE DELETE ON public.settlement_transitions
    FOR EACH ROW EXECUTE FUNCTION public.deny_settlement_transition_mutation();

-- Auto-update settlements.updated_at
CREATE OR REPLACE FUNCTION public.settlements_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settlements_updated_at ON public.settlements;
CREATE TRIGGER settlements_updated_at
    BEFORE UPDATE ON public.settlements
    FOR EACH ROW EXECUTE FUNCTION public.settlements_set_updated_at();

-- RLS
ALTER TABLE public.settlements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_transitions   ENABLE ROW LEVEL SECURITY;

CREATE POLICY settlements_service       ON public.settlements             FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY st_service                ON public.settlement_transitions  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
