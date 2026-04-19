-- =========================================================================
-- MIGRATION 141: BANK-GRADE WITHDRAWAL & PAYOUT ENGINE
-- Implements Balance Reservation, Fraud Gates, and State Machines
-- =========================================================================

BEGIN;

-- 1. Locked Reasons ENUM for Human/Support Clarity
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'withdrawal_lock_reason') THEN
        CREATE TYPE withdrawal_lock_reason AS ENUM ('withdrawal_pending', 'fraud_review', 'admin_hold');
    END IF;
END $$;

-- 2. Ledger Enhancement
ALTER TABLE ledger_entries 
    ADD COLUMN IF NOT EXISTS lock_reason withdrawal_lock_reason;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_lock_reason ON ledger_entries(lock_reason);

-- 3. Payout Requests Expansion
-- State Machine: REQUESTED -> VALIDATING -> APPROVED -> PROCESSING -> COMPLETED
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_state') THEN
        CREATE TYPE payout_state AS ENUM ('REQUESTED', 'VALIDATING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED');
    END IF;
END $$;

ALTER TABLE payout_requests 
    ADD COLUMN IF NOT EXISTS withdrawal_state payout_state DEFAULT 'REQUESTED',
    ADD COLUMN IF NOT EXISTS payout_hash TEXT UNIQUE, -- user+amount+destination+timebucket
    ADD COLUMN IF NOT EXISTS fraud_score INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ip_address INET,
    ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_payout_requests_state ON payout_requests(withdrawal_state);
CREATE INDEX IF NOT EXISTS idx_payout_requests_hash ON payout_requests(payout_hash);

-- 4. HARDEN WALLETS VIEW (COMPUTED BALANCES)
-- Drop and recreate dependencies
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
    
    -- TOTAL_BALANCE: Every immutable finalized or reserved record
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND status IN ('confirmed', 'success', 'COMPLETED', 'reserved')
    ), 0)::numeric(30,18) as balance,

    -- FINAL_BALANCE (Layer 4): Only hard-settled entries
    COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND is_final = true
        AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0)::numeric(30,18) as final_balance,
    
    -- RESERVED_BALANCE: Funds currently locked in the withdrawal pipeline (Layer 3)
    COALESCE((
        SELECT SUM(ABS(amount)) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND status = 'reserved'
    ), 0)::numeric(30,18) as reserved_balance,
    
    -- WITHDRAWABLE_BALANCE: Final balance minus reserved funds
    (COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND is_final = true
        AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0) - 
    COALESCE((
        SELECT SUM(ABS(amount)) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND status = 'reserved'
    ), 0))::numeric(30,18) as withdrawable_balance,
    
    -- AVAILABLE_BALANCE (Spendable): Everything confirmed (incl. provisional) minus reserved
    (COALESCE((
        SELECT SUM(amount) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND status IN ('confirmed', 'success', 'COMPLETED')
    ), 0) - 
    COALESCE((
        SELECT SUM(ABS(amount)) FROM ledger_entries 
        WHERE wallet_id = w.id 
        AND status = 'reserved'
    ), 0))::numeric(30,18) as available_balance

FROM public.wallets_store w;

-- Restore standard INSTEAD OF trigger
CREATE TRIGGER trg_wallets_upsert
INSTEAD OF INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.trg_wallets_upsert_fn();

-- 5. RPC: reserve_withdrawal_funds
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
    v_withdrawable NUMERIC;
    v_currency TEXT;
    v_ledger_id UUID;
BEGIN
    -- 1. Lock the wallet view/store to prevent race conditions
    SELECT withdrawable_balance, currency INTO v_withdrawable, v_currency 
    FROM wallets WHERE id = p_wallet_id AND user_id = p_user_id FOR UPDATE;

    -- 2. Validate sufficient FINAL funds
    IF v_withdrawable < p_amount THEN
        RAISE EXCEPTION 'Insufficient finalized funds. Available for withdrawal: % %', v_withdrawable, v_currency;
    END IF;

    -- 3. Create 'reserved' ledger entry
    -- This record immediately reduces withdrawable_balance in the view
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

-- 6. RPC: finalize_withdrawal_debit
CREATE OR REPLACE FUNCTION finalize_withdrawal_debit(p_ledger_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE ledger_entries 
    SET status = 'COMPLETED',
        is_provisional = false,
        is_final = true,
        lock_reason = NULL,
        completed_at = NOW()
    WHERE id = p_ledger_id AND status = 'reserved';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reserved ledger entry not found or already finalized.';
    END IF;
END;
$$;

-- 7. RPC: reverse_withdrawal_funds
CREATE OR REPLACE FUNCTION reverse_withdrawal_funds(p_ledger_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- We delete the 'reserved' entry to return funds to available pool.
    -- (Reserved entries are transient signals until finalized)
    DELETE FROM ledger_entries 
    WHERE id = p_ledger_id AND status = 'reserved';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reserved ledger entry not found or already finalized.';
    END IF;

    -- Log the reversal in audit
    INSERT INTO audit_logs (reference, action, status, details)
    VALUES (p_ledger_id::text, 'withdrawal_reversal', 'success', jsonb_build_object('reason', p_reason));
END;
$$;

COMMIT;
