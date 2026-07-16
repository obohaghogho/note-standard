-- ============================================================================
-- Migration 080: NON-NEGATIVE BALANCE CONSTRAINTS
-- ============================================================================
-- Purpose:
--   1. Enforce at the database level that balances cannot drop below zero.
--   2. This acts as the final safety net if application logic or RPCs fail.
-- ============================================================================

BEGIN;

-- 1. ADD CHECK CONSTRAINTS TO WALLETS_STORE
-- Note: 'NUMERIC' columns can store negative values by default. 
-- We explicitly forbid this for both total and available balances.

ALTER TABLE public.wallets_store 
    ADD CONSTRAINT balance_non_negative CHECK (balance >= 0),
    ADD CONSTRAINT available_balance_non_negative CHECK (available_balance >= 0);

-- Audit log for constraint enforcement
INSERT INTO public.security_audit_logs (event_type, severity, description)
VALUES ('CONSTRAINT_ENFORCEMENT', 'INFO', 'Added non-negative check constraints to wallets_store');

COMMIT;
