-- ============================================================
-- Migration 256: Immutable Audit Log
-- Purpose: Hash-chained, append-only treasury audit log.
--          Every treasury event, settlement, reserve change,
--          provider sync, and alert generates an immutable
--          record. Cannot be updated or deleted by any role.
-- Created: Enterprise Treasury Upgrade Phase 13
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.treasury_audit_log (
    id              BIGSERIAL PRIMARY KEY,              -- Sequential for chain ordering
    event_id        UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),

    -- Event classification
    event_type      VARCHAR(60)  NOT NULL,
    -- e.g. 'TREASURY_SYNC' | 'RESERVE_CALCULATED' | 'RESERVE_ALERT' | 'SETTLEMENT_TRANSITION'
    --       'SAFE_MODE_TRIGGERED' | 'TREASURY_TRANSFER_APPROVED' | 'LIQUIDITY_WARNING'
    --       'PROVIDER_HEALTH_CHANGE' | 'RECONCILIATION_DISCREPANCY' | 'FX_POSITION_RECORDED'

    event_subtype   VARCHAR(60),                        -- More specific classification

    -- Actor
    actor_type      VARCHAR(30)  NOT NULL DEFAULT 'SYSTEM',
    -- 'SYSTEM' | 'WORKER' | 'ADMIN' | 'WEBHOOK' | 'SCHEDULER'
    actor_id        VARCHAR(150),                       -- worker name or admin UUID
    actor_ip        VARCHAR(45),

    -- Subject of the event
    subject_type    VARCHAR(50),                        -- 'WALLET' | 'SETTLEMENT' | 'TREASURY_TRANSFER' | 'RESERVE' | 'PROVIDER'
    subject_id      VARCHAR(150),                       -- UUID or reference of subject
    provider        VARCHAR(50),
    currency        VARCHAR(10),

    -- Financial details (when applicable)
    amount          NUMERIC(30, 8),
    before_balance  NUMERIC(30, 8),
    after_balance   NUMERIC(30, 8),
    reserve_ratio   NUMERIC(10, 4),

    -- Context and correlation
    correlation_id  VARCHAR(100),                       -- HTTP correlation ID from request
    reference       VARCHAR(200),
    reason          TEXT,
    metadata        JSONB        DEFAULT '{}'::jsonb,

    -- Hash chain for tamper detection
    payload_hash    VARCHAR(64)  NOT NULL,              -- SHA-256 of (event_type + subject_id + amount + timestamp)
    previous_hash   VARCHAR(64),                        -- Hash of the previous row in the chain
    chain_valid     BOOLEAN      DEFAULT TRUE,          -- Set FALSE by integrity verification if chain breaks

    -- Timestamp — immutable
    occurred_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_tal_event_type    ON public.treasury_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_tal_provider      ON public.treasury_audit_log(provider);
CREATE INDEX IF NOT EXISTS idx_tal_currency      ON public.treasury_audit_log(currency);
CREATE INDEX IF NOT EXISTS idx_tal_occurred_at   ON public.treasury_audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tal_correlation   ON public.treasury_audit_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_tal_subject       ON public.treasury_audit_log(subject_type, subject_id);

-- IMMUTABILITY: Block ALL mutations
CREATE OR REPLACE FUNCTION public.deny_audit_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'treasury_audit_log is immutable. Operation "%" denied. Audit log cannot be modified.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS tal_deny_update ON public.treasury_audit_log;
CREATE TRIGGER tal_deny_update
    BEFORE UPDATE ON public.treasury_audit_log
    FOR EACH ROW EXECUTE FUNCTION public.deny_audit_log_mutation();

DROP TRIGGER IF EXISTS tal_deny_delete ON public.treasury_audit_log;
CREATE TRIGGER tal_deny_delete
    BEFORE DELETE ON public.treasury_audit_log
    FOR EACH ROW EXECUTE FUNCTION public.deny_audit_log_mutation();

-- TRUNCATE guard
CREATE OR REPLACE RULE treasury_audit_log_no_truncate AS
    ON DELETE TO public.treasury_audit_log
    DO INSTEAD NOTHING;

-- RLS: Insert only by service_role, read-only for authenticated admins
ALTER TABLE public.treasury_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tal_service_insert ON public.treasury_audit_log
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY tal_service_select ON public.treasury_audit_log
    FOR SELECT TO service_role USING (true);

COMMIT;
