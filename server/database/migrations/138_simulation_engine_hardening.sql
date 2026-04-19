-- =========================================================================
-- MIGRATION 138: SIMULATION ENGINE HARDENING
-- Implements explicit finality flags and adaptive per-region windows
-- =========================================================================

-- 1. Explicit Finality Flags on Ledger
ALTER TABLE ledger_entries 
    ADD COLUMN IF NOT EXISTS is_provisional BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;

-- 2. Adaptive Finality Configs
ALTER TABLE settlement_configs 
    ADD COLUMN IF NOT EXISTS hard_finality_delay_seconds INT DEFAULT 86400; -- Default 24h cap

-- Seed adaptive hard finality windows (Capped at 24h)
UPDATE settlement_configs SET hard_finality_delay_seconds = 7200 WHERE region = 'UK';    -- 2 hours for UK
UPDATE settlement_configs SET hard_finality_delay_seconds = 43200 WHERE region = 'US';   -- 12 hours for US
UPDATE settlement_configs SET hard_finality_delay_seconds = 86400 WHERE region = 'INTERNATIONAL_SWIFT'; -- 24h cap for SWIFT

-- 3. REFACTOR WALLETS VIEW (THE 3-BALANCE MODEL)
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
    
    -- SETTLING_BALANCE: Funds in Layer 3 (Provisional), waiting for hard finality
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND is_provisional = true 
        AND is_final = false
        AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0)::numeric(30,18) as settling_balance,
    
    -- FINAL_BALANCE: Hard Finality funds that cleared Layer 4
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND is_final = true
        AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0)::numeric(30,18) as final_balance,
    
    -- AVAILABLE_BALANCE: confirmed (final) + provisional (settling)
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0)::numeric(30,18) as available_balance,

    -- Legacy 'balance' for backwards compatibility
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0)::numeric(30,18) as balance
FROM public.wallets_store w;

-- 4. Restore Triggers
DROP TRIGGER IF EXISTS trg_wallets_upsert ON public.wallets;
CREATE TRIGGER trg_wallets_upsert
INSTEAD OF INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.trg_wallets_upsert_fn();

-- 5. Audit Log constraints for Hard Finality
-- Finality is REVERSIBLE only via COMPENSATING ENTRY, never deletion.
-- We already have the trigger prevent_audit_tampering, but we emphasize ledger record protection.
CREATE OR REPLACE FUNCTION protect_finalized_ledger()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_final = true THEN
        RAISE EXCEPTION 'CRITICAL: Hard Finality violations. Finalized ledger entries cannot be mutated or deleted. Use compensating entries.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_finalized_ledger ON ledger_entries;
CREATE TRIGGER trigger_protect_finalized_ledger
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION protect_finalized_ledger();
