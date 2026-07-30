-- Migration 277: Ledger Integrity Verification Reports
-- Automated mathematical proof of double-entry invariants (SUM(Debits) == SUM(Credits))

CREATE TABLE IF NOT EXISTS public.crypto_ledger_integrity_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(50) NOT NULL DEFAULT 'PASSED', -- PASSED, FAILED
    debits_total NUMERIC(36, 18) NOT NULL DEFAULT 0,
    credits_total NUMERIC(36, 18) NOT NULL DEFAULT 0,
    entries_count BIGINT NOT NULL DEFAULT 0,
    failed_checks JSONB,
    duration_ms INT NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crypto_integrity_status_verified ON public.crypto_ledger_integrity_reports(status, verified_at);
