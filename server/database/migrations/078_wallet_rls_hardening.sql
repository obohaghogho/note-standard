-- ============================================================================
-- Migration 078: WALLET RLS HARDENING (STRICT COMPLIANCE)
-- ============================================================================
-- Purpose:
--   1. Ensure users can only read their own wallet data (SELECT).
--   2. Explicitly disallow users from directly updating wallet balances (UPDATE).
--   3. All balance-affecting operations MUST go through SECURITY DEFINER RPCs.
-- ============================================================================

BEGIN;

-- 1. HARDEN WALLETS_STORE RLS
-- This is the underlying table for the 'wallets' view.
ALTER TABLE public.wallets_store ENABLE ROW LEVEL SECURITY;

-- Clear previous policies to start clean
DROP POLICY IF EXISTS "Users can view own wallets_store" ON public.wallets_store;
DROP POLICY IF EXISTS "Users can update own wallets_store" ON public.wallets_store;
DROP POLICY IF EXISTS "Admins can manage all wallets_store" ON public.wallets_store;

-- A. Allow users to READ their own wallets
CREATE POLICY "Users can view own wallet"
ON public.wallets_store
FOR SELECT
USING (auth.uid() = user_id);

-- B. Allow Admins to manage everything (Backup)
CREATE POLICY "Admins can manage all wallets_store"
ON public.wallets_store
FOR ALL
USING (is_admin(auth.uid()));

-- C. EXPLICITLY DENY UPDATE/INSERT/DELETE for users
-- (Done by NOT creating these policies for authenticated users)


-- 2. HARDEN TRANSACTIONS RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can manage all transactions" ON public.transactions;

-- A. Allow users to READ their own transactions
CREATE POLICY "Users can view own transactions"
ON public.transactions
FOR SELECT
USING (auth.uid() = user_id);

-- B. Admins manage all
CREATE POLICY "Admins can manage all transactions"
ON public.transactions
FOR ALL
USING (is_admin(auth.uid()));


-- 3. HARDEN LEDGER ENTRIES RLS
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ledger" ON public.ledger_entries;
DROP POLICY IF EXISTS "Admins can manage all ledger" ON public.ledger_entries;

-- A. Allow users to READ their own ledger entries
CREATE POLICY "Users can view own ledger"
ON public.ledger_entries
FOR SELECT
USING (auth.uid() = user_id);

-- B. Admins manage all
CREATE POLICY "Admins can manage all ledger"
ON public.ledger_entries
FOR ALL
USING (is_admin(auth.uid()));


-- 4. HARDEN SECURITY AUDIT LOGS RLS
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see own security logs" ON public.security_audit_logs;

CREATE POLICY "Users can view own security logs"
ON public.security_audit_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all security logs"
ON public.security_audit_logs
FOR ALL
USING (is_admin(auth.uid()));


-- 5. VERIFY RPC INTEGRITY
-- All balance-affecting RPCs (withdraw_funds_secured, execute_swap_atomic, transfer_funds, confirm_deposit)
-- already use SECURITY DEFINER in Migration 074/077, so they will bypass these RLS 
-- restrictions and continue to update balances safely on behalf of the user.

COMMIT;
