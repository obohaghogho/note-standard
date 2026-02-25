-- ============================================================================
-- Migration 070: TRANSACTION TYPE UNIFICATION & LEDGER UPDATES
-- ============================================================================
-- Purpose:
--   1. Standardize transaction types to a consistent set.
--   2. Update ledger functions to include all production transaction types.
--   3. Backfill existing transactions to the new type mapping.
-- ============================================================================

BEGIN;

-- 1. DATA BACKFILL (Map legacy/varied types to consolidated set)
-- Mapping: 'Digital Assets Purchase', 'FUNDING' -> 'DEPOSIT'
UPDATE public.transactions 
SET type = 'DEPOSIT', 
    display_label = COALESCE(display_label, 'Deposit')
WHERE type IN ('Digital Assets Purchase', 'FUNDING');

-- Mapping: 'AD_PAYMENT', 'PURCHASE' -> 'BUY'
UPDATE public.transactions
SET type = 'BUY',
    display_label = COALESCE(display_label, 'Purchase')
WHERE type IN ('AD_PAYMENT', 'PURCHASE');


-- 2. REFRESH LEDGER FUNCTIONS
-- A. TOTAL BALANCE (COMPLETED ONLY)
CREATE OR REPLACE FUNCTION public.calculate_wallet_balance_from_ledger(p_wallet_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_credits NUMERIC;
    v_debits NUMERIC;
BEGIN
    -- Credits
    SELECT COALESCE(SUM(amount), 0)
    INTO v_credits
    FROM public.transactions
    WHERE wallet_id = p_wallet_id
      AND status = 'COMPLETED'
      AND type IN ('DEPOSIT', 'TRANSFER_IN', 'SWAP_IN', 'AFFILIATE_COMMISSION', 'REFUND', 'SYSTEM_CREDIT');

    -- Debits (amount + fee)
    SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0)
    INTO v_debits
    FROM public.transactions
    WHERE wallet_id = p_wallet_id
      AND status = 'COMPLETED'
      AND type IN ('WITHDRAWAL', 'TRANSFER_OUT', 'SWAP_OUT', 'PAYOUT', 'SUBSCRIPTION_PAYMENT', 'BUY', 'AD_PAYMENT');

    RETURN v_credits - v_debits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- B. AVAILABLE BALANCE (Ledger Balance - Reservered Pending Debits)
CREATE OR REPLACE FUNCTION public.calculate_wallet_available_balance_from_ledger(p_wallet_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_ledger_balance NUMERIC;
    v_pending_debits NUMERIC;
BEGIN
    v_ledger_balance := public.calculate_wallet_balance_from_ledger(p_wallet_id);

    -- Reserved: Status PENDING or PROCESSING for Debit types
    SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0)
    INTO v_pending_debits
    FROM public.transactions
    WHERE wallet_id = p_wallet_id
      AND status IN ('PENDING', 'PROCESSING')
      AND type IN ('WITHDRAWAL', 'TRANSFER_OUT', 'SWAP_OUT', 'PAYOUT', 'SUBSCRIPTION_PAYMENT', 'BUY', 'AD_PAYMENT');

    RETURN v_ledger_balance - v_pending_debits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. REFRESH WALLETS (Triggering the synchronization)
UPDATE public.wallets w
SET balance = public.calculate_wallet_balance_from_ledger(w.id),
    available_balance = public.calculate_wallet_available_balance_from_ledger(w.id),
    updated_at = NOW();

COMMIT;
