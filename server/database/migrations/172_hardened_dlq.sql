-- Migration: 172_hardened_dlq.sql
-- Creates and hardens recovery forensics with causal lineage and state snapshots

-- 1. Create failure classification type if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dlq_failure_class') THEN
        CREATE TYPE dlq_failure_class AS ENUM (
            'INFRA_TEMPORARY',
            'ORDERING_HAZARD',
            'MATH_DRIFT',
            'IDEMPOTENCY_WAIT',
            'CANONICAL_VIOLATION'
        );
    END IF;
END $$;

-- 2. Create base DLQ if missing
CREATE TABLE IF NOT EXISTS public.dead_letter_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id TEXT,
    event_id TEXT, -- Original provider event ID
    raw_payload JSONB,
    context_snapshot JSONB,
    reason TEXT,
    failed_at TIMESTAMPTZ DEFAULT now(),
    retry_count INTEGER DEFAULT 0,
    failure_class dlq_failure_class,
    event_causal_parent_id UUID,
    event_causal_root_id UUID
);

-- 3. Add indices for settlement chain reconstruction
CREATE INDEX IF NOT EXISTS idx_dlq_causal_parent ON public.dead_letter_webhooks(event_causal_parent_id);
CREATE INDEX IF NOT EXISTS idx_dlq_causal_root ON public.dead_letter_webhooks(event_causal_root_id);
CREATE INDEX IF NOT EXISTS idx_dlq_job_id ON public.dead_letter_webhooks(job_id);

-- 4. Add audit comment
COMMENT ON TABLE public.dead_letter_webhooks IS 'Institutional-grade DLQ with settlement chain forensics and causal DAG reconstruction capabilities.';
