-- Migration 411: Fix Wallets Store RLS and Idempotent Wallet Provisioning RPC
-- Description: Provides a hardened, SECURITY DEFINER RPC (ensure_user_wallet) that guarantees
--              ONE USER + ONE ACTIVE ASSET = ONE WALLET RECORD across all network representations
--              (NATIVE, INTERNAL, NULL, bitcoin, ethereum, TRC20, ERC20, etc.)
--              hardens wallets_store RLS policies, and seeds required system LP/Treasury accounts.

BEGIN;

-- 1. Ensure wallets_store has RLS enabled
ALTER TABLE public.wallets_store ENABLE ROW LEVEL SECURITY;

-- 2. User SELECT policy
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets_store;
DROP POLICY IF EXISTS "Users can view own wallets_store" ON public.wallets_store;

CREATE POLICY "Users can view own wallet"
ON public.wallets_store
FOR SELECT
USING (
  auth.uid() = user_id OR 
  auth.role() = 'service_role' OR 
  (SELECT current_setting('role', true)) = 'service_role' OR 
  is_admin(auth.uid())
);

-- 3. User INSERT policy
DROP POLICY IF EXISTS "Users can insert own wallet" ON public.wallets_store;
DROP POLICY IF EXISTS "Users can insert own wallets_store" ON public.wallets_store;

CREATE POLICY "Users can insert own wallet"
ON public.wallets_store
FOR INSERT
WITH CHECK (
  auth.uid() = user_id OR 
  auth.role() = 'service_role' OR 
  (SELECT current_setting('role', true)) = 'service_role' OR
  is_admin(auth.uid())
);

-- 4. Admin & Service Role Management policy
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

-- 5. Hardened, SECURITY DEFINER RPC: ensure_user_wallet
CREATE OR REPLACE FUNCTION public.ensure_user_wallet(
    p_user_id UUID,
    p_currency VARCHAR,
    p_network VARCHAR DEFAULT 'NATIVE'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_currency VARCHAR;
    v_network VARCHAR;
    v_wallet_id UUID;
    v_address TEXT;
    v_caller_role TEXT;
    v_caller_uid UUID;
BEGIN
    -- Authorization & Identity Check
    v_caller_role := COALESCE(auth.role(), current_setting('role', true));
    v_caller_uid := auth.uid();

    IF v_caller_role != 'service_role' AND (v_caller_uid IS NULL OR v_caller_uid != p_user_id) THEN
        IF NOT is_admin(v_caller_uid) THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Cannot provision wallet for another user.';
        END IF;
    END IF;

    -- Parameter Normalization
    v_currency := UPPER(TRIM(p_currency));
    v_network := COALESCE(NULLIF(UPPER(TRIM(p_network)), ''), 'NATIVE');

    -- Step 1: Query for ANY existing personal wallet for (p_user_id, v_currency)
    -- Ignore system/settlement addresses, but match ANY user network representation
    SELECT id INTO v_wallet_id
    FROM public.wallets_store
    WHERE user_id = p_user_id
      AND UPPER(currency) = v_currency
      AND address NOT LIKE 'SYSTEM_%'
      AND address NOT LIKE 'SETTLEMENT_%'
      AND address NOT LIKE 'FX_POOL_%'
      AND address NOT LIKE 'TREASURY_%'
      AND address NOT LIKE 'REVENUE_%'
      AND address NOT LIKE 'PENDING_%'
      AND address NOT LIKE 'RECONCILIATION_%'
      AND (network IS NULL OR UPPER(network) NOT IN ('INTERNAL_SYSTEM', 'SYSTEM'))
    ORDER BY 
      CASE 
        WHEN UPPER(COALESCE(network, 'NATIVE')) = v_network THEN 1
        WHEN UPPER(COALESCE(network, 'NATIVE')) IN ('NATIVE', 'INTERNAL') THEN 2
        ELSE 3
      END,
      created_at ASC
    LIMIT 1;

    -- Step 2: Return existing wallet if found
    IF v_wallet_id IS NOT NULL THEN
        RETURN v_wallet_id;
    END IF;

    -- Step 3: Secure, single-row creation if no wallet exists
    v_address := v_currency || '_' || REPLACE(p_user_id::text, '-', '');

    INSERT INTO public.wallets_store (
        user_id,
        currency,
        network,
        address,
        provider,
        balance,
        available_balance,
        pending_balance,
        locked_balance
    )
    VALUES (
        p_user_id,
        v_currency,
        v_network,
        v_address,
        'internal',
        0.0000,
        0.0000,
        0.0000,
        0.0000
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_wallet_id;

    -- Step 4: Fallback re-query in case ON CONFLICT triggered due to race condition
    IF v_wallet_id IS NULL THEN
        SELECT id INTO v_wallet_id
        FROM public.wallets_store
        WHERE user_id = p_user_id
          AND UPPER(currency) = v_currency
          AND address NOT LIKE 'SYSTEM_%'
          AND address NOT LIKE 'SETTLEMENT_%'
          AND address NOT LIKE 'FX_POOL_%'
          AND address NOT LIKE 'TREASURY_%'
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'FAILED_TO_INITIALIZE_WALLET: Unable to provision % wallet for user %.', v_currency, p_user_id;
    END IF;

    RETURN v_wallet_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_wallet(UUID, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_wallet(UUID, VARCHAR, VARCHAR) TO service_role;

-- 6. Ensure system Liquidity Pool, Treasury, FX Pool, and Revenue wallets exist for GHS & active assets
DO $$
DECLARE
    v_sys_id UUID;
    v_curr TEXT;
    v_currencies TEXT[] := ARRAY['NGN', 'USD', 'GHS', 'BTC', 'ETH', 'USDT', 'USDC'];
BEGIN
    SELECT id INTO v_sys_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_sys_id IS NULL THEN
        SELECT id INTO v_sys_id FROM public.profiles LIMIT 1;
    END IF;

    IF v_sys_id IS NOT NULL THEN
        FOREACH v_curr IN ARRAY v_currencies LOOP
            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'SYSTEM_LP_' || v_curr, 'internal', 0, 0)
            ON CONFLICT DO NOTHING;

            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'TREASURY_' || v_curr, 'internal', 100000.0, 100000.0)
            ON CONFLICT DO NOTHING;

            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'REVENUE_' || v_curr, 'internal', 0, 0)
            ON CONFLICT DO NOTHING;

            INSERT INTO public.wallets_store (id, user_id, currency, network, address, provider, balance, available_balance)
            VALUES (gen_random_uuid(), v_sys_id, v_curr, 'INTERNAL', 'FX_POOL_' || v_curr, 'internal', 100000.0, 100000.0)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;

COMMIT;
