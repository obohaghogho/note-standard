-- =========================================================================
-- MIGRATION 136: BANK SETTLEMENT EMULATION & FINALITY SYSTEM
-- Implements settlement cycles, provisional ledger layers, and audit audits
-- =========================================================================

-- 1. Settlement Status for Transactions
ALTER TABLE transactions 
    ADD COLUMN IF NOT EXISTS settlement_status TEXT DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS settlement_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_transactions_settlement_status ON transactions(settlement_status);

-- 2. Ledger Finality Separation
ALTER TABLE ledger_entries 
    ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_is_final ON ledger_entries(is_final);

-- 3. Settlement Configs (Region-specific rules)
CREATE TABLE IF NOT EXISTS settlement_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region TEXT UNIQUE NOT NULL, -- 'UK', 'US', 'INTERNATIONAL_SWIFT'
    delay_seconds INT NOT NULL DEFAULT 600, -- Default 10 mins
    min_confirmation_cycles INT NOT NULL DEFAULT 2, -- Must appear in this many logs
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default configs
INSERT INTO settlement_configs (region, delay_seconds, min_confirmation_cycles)
VALUES 
    ('UK', 600, 2),        -- 10 mins
    ('US', 10800, 2),      -- 3 hours
    ('INTERNATIONAL_SWIFT', 86400, 3) -- 24 hours
ON CONFLICT (region) DO UPDATE 
SET delay_seconds = EXCLUDED.delay_seconds, 
    min_confirmation_cycles = EXCLUDED.min_confirmation_cycles;

-- 4. Global Audit Cycles Table
CREATE TABLE IF NOT EXISTS audit_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_time TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL, -- 'success', 'discrepancy_found'
    items_verified INT,
    anomalies JSONB DEFAULT '[]',
    hash_chain_valid BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. UPGRADED WALLETS VIEW (Provisional vs Final Balances)
-- We drop and recreate to avoid "cannot change data type of view column" errors
-- and ensure the column list can be safely expanded.
DROP VIEW IF EXISTS public.wallets CASCADE;

CREATE OR REPLACE VIEW public.wallets AS
SELECT 
    w.id,
    w.user_id,
    w.currency,
    w.address,
    w.is_frozen,
    w.created_at,
    w.updated_at,
    -- Total Balance: Everything that is confirmed (provisional or final)
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0)::numeric(30,18) as balance,
    
    -- Finalized Balance: Only entries where settlement is complete
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id AND is_final = true
    ), 0)::numeric(30,18) as finalized_balance,
    
    -- Available Balance: Confirmed balance minus pending debits
    (COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0) - 
    COALESCE((
        SELECT SUM(ABS(amount)) FROM ledger_entries 
        WHERE wallet_id = w.id AND status = 'pending' AND amount < 0
    ), 0))::numeric(30,18) as available_balance
FROM public.wallets_store w;

-- 5b. Restore the INSTEAD OF trigger on the wallets view (dropped by CASCADE)
-- This ensures legacy code can still insert/update via the 'wallets' view interface.
DROP TRIGGER IF EXISTS trg_wallets_upsert ON public.wallets;
CREATE TRIGGER trg_wallets_upsert
INSTEAD OF INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.trg_wallets_upsert_fn();

-- 6. Trigger to track settlement transitions in audit_logs
CREATE OR REPLACE FUNCTION log_settlement_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.settlement_status IS DISTINCT FROM NEW.settlement_status) THEN
        INSERT INTO audit_logs (reference, action, status, details)
        VALUES (
            NEW.id::text,
            'settlement_stage_transition',
            'success',
            jsonb_build_object(
                'from', OLD.settlement_status,
                'to', NEW.settlement_status,
                'timestamp', NOW()
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_settlement_transition ON transactions;
CREATE TRIGGER trigger_log_settlement_transition
AFTER UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION log_settlement_transition();
