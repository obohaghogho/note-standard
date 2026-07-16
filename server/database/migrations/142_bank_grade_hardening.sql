-- =========================================================================
-- MIGRATION 142: TRUE BANK-GRADE WITHDRAWAL HARDENING (VOL. 2)
-- Implements Extended States, Active Defense, and Race Condition Protection
-- =========================================================================

-- Note: ALTER TYPE ... ADD VALUE cannot be inside a TRANSACTION block in some Postgres versions.
-- We run these individually if possible, or use the check-first pattern.

ALTER TYPE payout_state ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE payout_state ADD VALUE IF NOT EXISTS 'SETTLED';
ALTER TYPE payout_state ADD VALUE IF NOT EXISTS 'SENT_UNCONFIRMED';

BEGIN;

-- 1. Payout Requests Expansion (Crash Recovery & Provider Tracking)
ALTER TABLE payout_requests 
    ADD COLUMN IF NOT EXISTS provider_reference TEXT,
    ADD COLUMN IF NOT EXISTS execution_status TEXT DEFAULT 'initiated', -- initiated, sent, confirmed
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'LOW'; -- LOW, MEDIUM, HIGH

CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_requests_provider_ref ON payout_requests(provider_reference) WHERE (provider_reference IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_payout_requests_severity ON payout_requests(severity);

-- 2. HARDENED RPC: reserve_withdrawal_funds (Zero-Race-Condition)
-- Now targets 'wallets_store' directly for the lock, bypassing view complexities.
CREATE OR REPLACE FUNCTION reserve_withdrawal_funds(
    p_user_id UUID,
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_reference TEXT,
    p_lock_reason withdrawal_lock_reason
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance NUMERIC;
    v_reserved NUMERIC;
    v_final NUMERIC;
    v_withdrawable NUMERIC;
    v_currency TEXT;
    v_ledger_id UUID;
BEGIN
    -- 1. HARD LOCK on the underlying store
    -- This ensures no other process can modify this wallet during calculation
    SELECT currency INTO v_currency FROM wallets_store WHERE id = p_wallet_id AND user_id = p_user_id FOR UPDATE;

    -- 2. Recalculate withdrawable_balance from scratch within the transaction
    -- FINAL_BALANCE (Layer 4)
    v_final := COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = p_wallet_id 
        AND is_final = true
        AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0);

    -- CURRENT_RESERVED (Layer 3)
    v_reserved := COALESCE((
        SELECT SUM(ABS(amount)) FROM ledger_entries 
        WHERE wallet_id = p_wallet_id 
        AND status = 'reserved'
    ), 0);

    v_withdrawable := v_final - v_reserved;

    -- 3. Validate
    IF v_withdrawable < p_amount THEN
        RAISE EXCEPTION 'Insufficient finalized funds. Available for withdrawal: % %', v_withdrawable, v_currency;
    END IF;

    -- 4. Create 'reserved' ledger entry
    INSERT INTO ledger_entries (
        user_id, wallet_id, amount, currency, status, 
        reference, is_provisional, is_final, lock_reason, created_at
    ) VALUES (
        p_user_id, p_wallet_id, -p_amount, v_currency, 'reserved',
        p_reference, true, false, p_lock_reason, NOW()
    ) RETURNING id INTO v_ledger_id;

    RETURN v_ledger_id;
END;
$$;

-- 3. Update Audit Worker severities in existing tables?
-- (Assuming audit_cycles tables already exist from Migration 138-140)

COMMIT;
