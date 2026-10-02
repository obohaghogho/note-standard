-- ============================================================================
-- Migration 502: Harden Payout Batches RLS and Security
-- Resolves Supabase Security Alert: rls_disabled_in_public for payout_batches & payout_batch_items
-- ============================================================================
-- Purpose:
--   1. Enable Row-Level Security (RLS) on public.payout_batches and public.payout_batch_items
--   2. Revoke unauthenticated anon/public access
--   3. Grant explicit access to service_role and authenticated roles
--   4. Define strict RLS SELECT, INSERT, UPDATE policies for creator, recipient, and admin access
-- ============================================================================

BEGIN;

-- 1. ENABLE ROW LEVEL SECURITY ON PAYOUT BATCHES TABLES
ALTER TABLE IF EXISTS public.payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payout_batch_items ENABLE ROW LEVEL SECURITY;

-- 2. REVOKE ANON AND PUBLIC PRIVILEGES
REVOKE ALL ON TABLE public.payout_batches FROM anon, public;
REVOKE ALL ON TABLE public.payout_batch_items FROM anon, public;

-- 3. GRANT SERVICE ROLE AND AUTHENTICATED PRIVILEGES
GRANT ALL ON TABLE public.payout_batches TO service_role;
GRANT ALL ON TABLE public.payout_batch_items TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.payout_batches TO authenticated;
GRANT SELECT, INSERT ON TABLE public.payout_batch_items TO authenticated;

-- 4. RLS POLICIES FOR public.payout_batches
DROP POLICY IF EXISTS "Users can view own created or approved payout batches" ON public.payout_batches;
DROP POLICY IF EXISTS "Creators can insert own payout batches" ON public.payout_batches;
DROP POLICY IF EXISTS "Creators and admins can update own payout batches" ON public.payout_batches;

-- SELECT policy: Users can read batches they created or approved, or if they are admin
CREATE POLICY "Users can view own created or approved payout batches"
  ON public.payout_batches FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR approved_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (role = 'admin' OR admin_role IS NOT NULL)
    )
  );

-- INSERT policy: Authenticated users can insert batches where created_by is themselves
CREATE POLICY "Creators can insert own payout batches"
  ON public.payout_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
  );

-- UPDATE policy: Creators can update draft/pending batches; admins can update any batch
CREATE POLICY "Creators and admins can update own payout batches"
  ON public.payout_batches FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (role = 'admin' OR admin_role IS NOT NULL)
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (role = 'admin' OR admin_role IS NOT NULL)
    )
  );

-- 5. RLS POLICIES FOR public.payout_batch_items
DROP POLICY IF EXISTS "Users can view relevant payout batch items" ON public.payout_batch_items;
DROP POLICY IF EXISTS "Creators can insert payout batch items" ON public.payout_batch_items;

-- SELECT policy: Batch creator, batch item recipient, or admin can view batch items
CREATE POLICY "Users can view relevant payout batch items"
  ON public.payout_batch_items FOR SELECT
  TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.payout_batches pb
      WHERE pb.id = payout_batch_items.batch_id
        AND (pb.created_by = auth.uid() OR pb.approved_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (role = 'admin' OR admin_role IS NOT NULL)
    )
  );

-- INSERT policy: Batch creator can insert items for their own batch
CREATE POLICY "Creators can insert payout batch items"
  ON public.payout_batch_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payout_batches pb
      WHERE pb.id = payout_batch_items.batch_id
        AND pb.created_by = auth.uid()
    )
  );

COMMIT;
