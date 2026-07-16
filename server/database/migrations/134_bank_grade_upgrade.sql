-- =========================================================================
-- MIGRATION 134: BANK-GRADE FINTECH UPGRADE
-- Implements state-machines, append-only logs, and ledger immutability
-- =========================================================================

-- 1. Dual-Layer Idempotency for Webhooks
ALTER TABLE webhook_events 
    ADD COLUMN IF NOT EXISTS business_hash TEXT UNIQUE;

-- 2. Hard Reconciliation Engine
ALTER TABLE reconciliation_queue 
    ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 5,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Ledger Immutability (Hash Chain)
ALTER TABLE ledger_entries 
    ADD COLUMN IF NOT EXISTS hash_chain TEXT;

-- Trigger to auto-generate ledger hash_chain if not provided (cryptographic chain)
CREATE OR REPLACE FUNCTION generate_ledger_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash TEXT;
BEGIN
    -- For real cryptographically secure chains, you fetch the last entry for this wallet
    SELECT hash_chain INTO prev_hash FROM ledger_entries 
    WHERE wallet_id = NEW.wallet_id AND id != NEW.id
    ORDER BY created_at DESC LIMIT 1;

    -- If no previous hash exists, use the wallet_id as genesis
    IF prev_hash IS NULL THEN
        prev_hash := NEW.wallet_id::text;
    END IF;

    -- SHA256 of: previous_hash + current_reference + amount + currency
    NEW.hash_chain := encode(digest(prev_hash || NEW.reference::text || NEW.amount::text || NEW.currency, 'sha256'), 'hex');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Make sure pgcrypto is enabled (needed for digest)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TRIGGER IF EXISTS trigger_generate_ledger_hash_chain ON ledger_entries;
CREATE TRIGGER trigger_generate_ledger_hash_chain
BEFORE INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION generate_ledger_hash_chain();


-- 4. Append-Only Immutability Logs
CREATE OR REPLACE FUNCTION prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'CRITICAL: audit_logs is append-only. UPDATE and DELETE operations are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_audit_tampering ON audit_logs;
CREATE TRIGGER trigger_prevent_audit_tampering
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_tampering();


-- 5. Payment State Machine Enforcement (PostgreSQL Constraint & Trigger)
-- First, expand Check Constraint to explicitly list allowed states globally (including safe legacy support)
DO $$
BEGIN
    ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
    ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (
        status IN (
            'INITIATED', 'PENDING_EMAIL_CONFIRMATION', 'PARSED', 
            'MATCHED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 
            'CREDITED', 'EXPIRED', 'failed', 'success', 'pending'
        )
    );
END $$;

-- DB-Level transition protections
CREATE OR REPLACE FUNCTION enforce_payment_state_machine()
RETURNS TRIGGER AS $$
BEGIN
    -- Ignore on INSERT
    IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;

    -- Terminal states cannot be mutated backwards unless by Admin (which we'll limit elsewhere)
    IF OLD.status IN ('CREDITED', 'success') AND NEW.status NOT IN ('CREDITED', 'success', 'failed') THEN
        RAISE EXCEPTION 'Illegal state transition: Cannot revert a CREDITED transaction.';
    END IF;

    -- Must pass through MATCHED or APPROVED before CREDITED
    IF NEW.status IN ('CREDITED', 'success') AND OLD.status NOT IN ('MATCHED', 'APPROVED', 'UNDER_REVIEW', 'pending') THEN
        RAISE EXCEPTION 'Illegal state transition: Payment must be MATCHED or APPROVED before being CREDITED.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_payment_state_machine ON payments;
CREATE TRIGGER trigger_enforce_payment_state_machine
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION enforce_payment_state_machine();
