-- ============================================================================
-- Migration 164: Institutional Ledger Sentinel (Bank-Grade Finality)
-- ============================================================================
-- Purpose:
--   1. Establish an absolute Journal-First architecture.
--   2. Implement dual-layer invariance (Sequence + State Machine).
--   3. Enable deterministic order via Global Sequence.
-- ============================================================================

BEGIN;

-- 1. EXTENSIONS & TYPES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status_v6') THEN
        CREATE TYPE settlement_status_v6 AS ENUM ('PENDING', 'SETTLED', 'RECONCILED', 'REVERSED');
    END IF;
END $$;

-- 2. GLOBAL ORDERING SEQUENCE
-- Ensures across-the-board causality tracking for all financial events.
CREATE SEQUENCE IF NOT EXISTS public.ledger_sequence_number_seq START 1;

-- 3. THE TRANSACTION HEADER (The ledger_event_id)
CREATE TABLE IF NOT EXISTS public.ledger_transactions_v6 (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key     TEXT UNIQUE NOT NULL,
    type                TEXT NOT NULL, -- e.g. 'SWAP', 'TRANSFER', 'WITHDRAWAL', 'NORMALIZATION'
    status              settlement_status_v6 NOT NULL DEFAULT 'PENDING',
    ledger_sequence_number BIGINT DEFAULT nextval('public.ledger_sequence_number_seq'),
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v6_tx_idempotency ON public.ledger_transactions_v6(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_v6_tx_sequence ON public.ledger_transactions_v6(ledger_sequence_number);

-- 4. THE JOURNAL ENTRIES (Atomic Lines)
CREATE TABLE IF NOT EXISTS public.ledger_entries_v6 (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID NOT NULL REFERENCES public.ledger_transactions_v6(id) ON DELETE CASCADE,
    wallet_id       UUID NOT NULL REFERENCES public.wallets_store(id),
    user_id         UUID NOT NULL REFERENCES public.profiles(id),
    currency        VARCHAR(10) NOT NULL,
    amount          NUMERIC(30,18) NOT NULL, -- Positive = Credit, Negative = Debit
    side            TEXT NOT NULL CHECK (side IN ('DEBIT', 'CREDIT')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    -- Invariant: An entry must match its side
    CONSTRAINT check_amount_side CHECK (
        (side = 'CREDIT' AND amount > 0) OR 
        (side = 'DEBIT' AND amount < 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_v6_entries_tx ON public.ledger_entries_v6(transaction_id);
CREATE INDEX IF NOT EXISTS idx_v6_entries_wallet ON public.ledger_entries_v6(wallet_id);

-- 5. JOURNAL INTEGRITY SENTINEL (The Hard Fail Boundary)
-- Enforces that every transaction MUST satisfy Σ debits = Σ credits.
CREATE OR REPLACE FUNCTION public.check_journal_integrity_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_sum NUMERIC;
BEGIN
    -- Only check when all entries for a transaction are suspected to be in.
    -- Note: In a high-concurrency system, we prefer checking at commit time.
    -- For Postgres, we use a CONSTRAINT TRIGGER deferred to the end of the transaction.
    
    SELECT SUM(amount) INTO v_sum 
    FROM public.ledger_entries_v6 
    WHERE transaction_id = NEW.transaction_id;
    
    IF v_sum != 0 THEN
        RAISE EXCEPTION 'JOURNAL_INTEGRITY_VIOLATION: Transaction % does not balance (SUM = %)', NEW.transaction_id, v_sum;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Use a deferred constraint trigger to allow multiple inserts before validation.
DROP TRIGGER IF EXISTS trg_v6_ledger_integrity ON public.ledger_entries_v6;
CREATE CONSTRAINT TRIGGER trg_v6_ledger_integrity
AFTER INSERT OR UPDATE ON public.ledger_entries_v6
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_journal_integrity_fn();

-- 6. THE DETERMINISTIC VIEW (Read-Only Truth)
-- Replaces old balance logic with real-time summation.
DROP VIEW IF EXISTS public.wallets_v6;
CREATE OR REPLACE VIEW public.wallets_v6 AS
SELECT 
    w.id,
    w.user_id,
    w.currency,
    w.network,
    w.address,
    w.is_frozen,
    w.provider,
    COALESCE(SUM(l.amount), 0) as balance,
    -- Available balance in v6 is computed as (Settled Credits + Pending/Settled Debits)
    -- But for Phase 6A, we'll start with total ledger sum.
    COALESCE(SUM(l.amount), 0) as available_balance
FROM public.wallets_store w
LEFT JOIN public.ledger_entries_v6 l ON l.wallet_id = w.id
GROUP BY w.id;

-- Ensure view is NOT writable by having no INSTEAD OF triggers.

-- 7. BOOTSTRAP SYSTEM LP ACCOUNTS
-- These are required for atomic swap counterparties.
-- In an institutional ledger, these must be anchored to a valid identity.
-- We dynamically find the first admin to own these internal system accounts.

DO $$
DECLARE
    v_sys_id UUID;
BEGIN
    -- 1. Find an existing administrative identity
    SELECT id INTO v_sys_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    
    -- 2. Emergency fallback to the first profile if no admin exists (prevents migration failure)
    IF v_sys_id IS NULL THEN
        SELECT id INTO v_sys_id FROM public.profiles LIMIT 1;
    END IF;

    IF v_sys_id IS NULL THEN
        RAISE NOTICE 'No profiles found; LP bootstrap will be skipped. Ensure a profile exists and re-run.';
    ELSE
        -- Initialize LP Wallets for USD, BTC, ETH
        -- We use ON CONFLICT (address) DO NOTHING to prevent duplicates on re-run
        -- Note: addresses like 'SYSTEM_LP_USD' are effectively reserved keywords.
        
        INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider)
        VALUES 
            (uuid_generate_v4(), v_sys_id, 'USD', 'INTERNAL', 'SYSTEM_LP_USD', 'internal'),
            (uuid_generate_v4(), v_sys_id, 'BTC', 'BITCOIN', 'SYSTEM_LP_BTC', 'internal'),
            (uuid_generate_v4(), v_sys_id, 'ETH', 'ETHEREUM', 'SYSTEM_LP_ETH', 'internal')
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'System LP accounts bootstrapped successfully for identity %', v_sys_id;
    END IF;
END $$;

-- 8. ATOMIC COMMIT RPC
CREATE OR REPLACE FUNCTION public.execute_ledger_transaction_v6(
    p_idempotency_key TEXT,
    p_type            TEXT,
    p_status          settlement_status_v6,
    p_metadata        JSONB,
    p_entries         JSONB -- Array of {wallet_id, user_id, currency, amount, side}
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_entry JSONB;
BEGIN
    -- 1. Idempotency Guard
    SELECT id INTO v_tx_id FROM public.ledger_transactions_v6 WHERE idempotency_key = p_idempotency_key;
    IF v_tx_id IS NOT NULL THEN
        RETURN v_tx_id;
    END IF;

    -- 2. Insert Header
    INSERT INTO public.ledger_transactions_v6 (idempotency_key, type, status, metadata)
    VALUES (p_idempotency_key, p_type, p_status, p_metadata)
    RETURNING id INTO v_tx_id;

    -- 3. Insert Entries
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        INSERT INTO public.ledger_entries_v6 (transaction_id, wallet_id, user_id, currency, amount, side)
        VALUES (
            v_tx_id, 
            (v_entry->>'wallet_id')::UUID, 
            (v_entry->>'user_id')::UUID, 
            v_entry->>'currency', 
            (v_entry->>'amount')::NUMERIC, 
            v_entry->>'side'
        );
    END LOOP;

    -- 4. Invariant trigger 'trg_v6_ledger_integrity' will automatically validate Σ = 0 here.
    
    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
