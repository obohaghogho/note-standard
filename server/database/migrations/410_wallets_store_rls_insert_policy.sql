-- Migration 410: Wallets Store RLS Insert Policy Hardening
-- Purpose:
--   1. Ensure authenticated users can insert their own wallet row on wallets_store (auth.uid() = user_id).
--   2. Ensure service_role and admins have full bypass management rights.
-- ============================================================================

BEGIN;

ALTER TABLE public.wallets_store ENABLE ROW LEVEL SECURITY;

-- 1. User SELECT policy
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets_store;
DROP POLICY IF EXISTS "Users can view own wallets_store" ON public.wallets_store;

CREATE POLICY "Users can view own wallet"
ON public.wallets_store
FOR SELECT
USING (auth.uid() = user_id);

-- 2. User INSERT policy (Fixes: new row violates row-level security policy for table "wallets_store")
DROP POLICY IF EXISTS "Users can insert own wallet" ON public.wallets_store;
DROP POLICY IF EXISTS "Users can insert own wallets_store" ON public.wallets_store;

CREATE POLICY "Users can insert own wallet"
ON public.wallets_store
FOR INSERT
WITH CHECK (
  auth.uid() = user_id OR 
  auth.role() = 'service_role' OR 
  (SELECT current_setting('role', true)) = 'service_role'
);

-- 3. Admin & Service Role Management
DROP POLICY IF EXISTS "Admins can manage all wallets_store" ON public.wallets_store;
DROP POLICY IF EXISTS "Service role and admins manage wallets_store" ON public.wallets_store;

CREATE POLICY "Service role and admins manage wallets_store"
ON public.wallets_store
FOR ALL
USING (
  auth.role() = 'service_role' OR 
  (SELECT current_setting('role', true)) = 'service_role' OR 
  is_admin(auth.uid())
);

COMMIT;
