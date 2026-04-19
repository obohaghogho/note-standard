-- =========================================================================
-- MIGRATION 143: BANK-GRADE 'FINAL FORM' INFRASTRUCTURE
-- Implements 5-Layer Ledger, 8-Stage Payout Machine, & Per-Wallet Hashing
-- =========================================================================

-- Note: ALTER TYPE ... ADD VALUE cannot be inside a TRANSACTION block in some Postgres versions.
ALTER TYPE payout_state ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TYPE payout_state ADD VALUE IF NOT EXISTS 'APPROVED';

-- 1. Ledger Layering
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_layer') THEN
        CREATE TYPE ledger_layer AS ENUM ('RAW', 'MATCHING', 'PROVISIONAL', 'SETTLEMENT', 'FINAL');
    END IF;
END $$;

BEGIN;

-- 2. Ledger Hardening (Per-Wallet Hash Chain)
ALTER TABLE ledger_entries 
    ADD COLUMN IF NOT EXISTS layer ledger_layer DEFAULT 'PROVISIONAL',
    ADD COLUMN IF NOT EXISTS previous_wallet_hash TEXT,
    ADD COLUMN IF NOT EXISTS entry_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_layer ON ledger_entries(layer);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_hash ON ledger_entries(wallet_id, created_at);

-- 3. Admin Multi-Sig Approval Table
CREATE TABLE IF NOT EXISTS admin_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'payout_request', 'ledger_correction'
    entity_id UUID NOT NULL,
    admin_id UUID NOT NULL REFERENCES auth.users(id),
    approval_type TEXT DEFAULT 'SAFE_MODE_OVERRIDE',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id, admin_id) -- One approval per admin per entity
);

-- 4. TRIGGER: Autonomous Per-Wallet Hash Chaining
CREATE OR REPLACE FUNCTION calculate_ledger_hash()
RETURNS TRIGGER AS $$
DECLARE
    v_prev_hash TEXT;
BEGIN
    -- 1. Grab the hash of the most recent entry for this wallet
    SELECT entry_hash INTO v_prev_hash 
    FROM ledger_entries 
    WHERE wallet_id = NEW.wallet_id 
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    NEW.previous_wallet_hash := COALESCE(v_prev_hash, 'GENESIS');
    
    -- 2. Calculate current entry hash
    NEW.entry_hash := encode(digest(
        concat(
            COALESCE(v_prev_hash, 'GENESIS'),
            NEW.wallet_id::text,
            NEW.amount::text,
            NEW.currency,
            NEW.reference,
            NEW.created_at::text
        ), 'sha256'
    ), 'hex');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_hashing ON ledger_entries;
CREATE TRIGGER trg_ledger_hashing
BEFORE INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION calculate_ledger_hash();

-- 5. UPGRADED WALLETS VIEW (Architect's 5-Field Model)
DROP VIEW IF EXISTS public.wallets CASCADE;

CREATE OR REPLACE VIEW public.wallets AS
SELECT 
    w.id,
    w.user_id,
    w.currency,
    w.network,
    w.address,
    w.is_frozen,
    w.provider,
    w.created_at,
    w.updated_at,
    
    -- 1. FINAL_BALANCE: Immutable, hard-settled funds
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id AND layer = 'FINAL'
    ), 0)::numeric(30,18) as final_balance,

    -- 2. SETTLING_BALANCE: Funds between Provisional and Final
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id AND layer IN ('PROVISIONAL', 'SETTLEMENT')
    ), 0)::numeric(30,18) as settling_balance,
    
    -- 3. RESERVED_BALANCE: Funds locked for pending withdrawals
    COALESCE((
        SELECT SUM(ABS(amount)) FROM ledger_entries 
        WHERE wallet_id = w.id AND status = 'reserved'
    ), 0)::numeric(30,18) as reserved_balance,
    
    -- 4. AVAILABLE_BALANCE: Sum(Final + Provisional) - Reserved
    (COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id AND layer IN ('PROVISIONAL', 'SETTLEMENT', 'FINAL')
    ), 0) - 
    COALESCE((
        SELECT SUM(ABS(amount)) FROM ledger_entries 
        WHERE wallet_id = w.id AND status = 'reserved'
    ), 0))::numeric(30,18) as available_balance,

    -- 5. WITHDRAWABLE_BALANCE: Finalized Balance - Reserved
    (COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id AND layer = 'FINAL'
    ), 0) - 
    COALESCE((
        SELECT SUM(ABS(amount)) FROM ledger_entries 
        WHERE wallet_id = w.id AND status = 'reserved'
    ), 0))::numeric(30,18) as withdrawable_balance

FROM public.wallets_store w;

-- Restore INSTEAD OF trigger
CREATE TRIGGER trg_wallets_upsert
INSTEAD OF INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.trg_wallets_upsert_fn();

COMMIT;
