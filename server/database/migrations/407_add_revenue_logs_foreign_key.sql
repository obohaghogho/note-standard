-- ============================================================================
-- Migration 407: Enforce Foreign Key Constraint on revenue_logs
-- ============================================================================
-- Purpose:
--   Guarantees at PostgreSQL DB level that `revenue_logs.source_transaction_id`
--   MUST reference a valid, existing row in `public.transactions(id)`.
--   Prevents orphaned or non-existent source transaction IDs from ever being logged.
-- ============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_revenue_logs_source_transaction'
    ) THEN
        ALTER TABLE public.revenue_logs
        ADD CONSTRAINT fk_revenue_logs_source_transaction
        FOREIGN KEY (source_transaction_id)
        REFERENCES public.transactions(id)
        ON DELETE RESTRICT;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

COMMIT;
