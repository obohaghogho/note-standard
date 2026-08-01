-- =============================================================================
-- Migration 280: Expand Fincra Currency Support to All Approved Currencies
-- =============================================================================
-- SAFETY CONTRACT:
--   - ADDITIVE ONLY. No existing tables dropped or altered destructively.
--   - No existing row data is modified.
--   - Only removes overly-restrictive CHECK constraints that limited currency
--     to NGN, USD, EUR. Application layer (constants.js + service guards)
--     now owns currency validation.
--   - Expands signup trigger to provision wallets for all 21 active currencies.
--   - Provides a one-time backfill RPC for existing users.
--
-- Active currencies (full feature set):
--   NGN, USD, EUR, GBP, CAD, GHS, KES, TZS, UGX, ZAR,
--   XOF, MWK, RWF, XAF, ZMW, EGP, CNY, CNH, USDT, USDC, CNGN
--
-- Coming soon (display only, no transactions):
--   AUD, NZD, JPY
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PART 1: Drop restrictive currency CHECK constraints
-- These constraints were written when only NGN/USD/EUR were planned.
-- Application-layer validation (FINCRA_CURRENCIES constant) now owns this.
-- ---------------------------------------------------------------------------

ALTER TABLE public.fincra_transactions
  DROP CONSTRAINT IF EXISTS fincra_transactions_currency_check;

ALTER TABLE public.fincra_wallet_links
  DROP CONSTRAINT IF EXISTS fincra_wallet_links_currency_check;

-- ---------------------------------------------------------------------------
-- PART 2: Ensure wallets_store indexes exist for new currencies
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_wallets_store_currency
  ON public.wallets_store(currency);

CREATE INDEX IF NOT EXISTS idx_wallets_store_user_currency
  ON public.wallets_store(user_id, currency);

-- ---------------------------------------------------------------------------
-- PART 3: Shared function — provision all active Fincra wallets for one user
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_fiat_wallets_for_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_username TEXT;
  v_address TEXT;
  v_currency TEXT;
  v_active_currencies TEXT[] := ARRAY[
    'NGN','USD','EUR','GBP','CAD',
    'GHS','KES','TZS','UGX','ZAR',
    'XOF','MWK','RWF','XAF','ZMW',
    'EGP','CNY','CNH','USDT','USDC',
    'CNGN'
  ];
BEGIN
  SELECT email, username
  INTO v_email, v_username
  FROM public.profiles
  WHERE id = p_user_id;

  v_address := COALESCE(v_email, v_username, p_user_id::TEXT);

  FOREACH v_currency IN ARRAY v_active_currencies LOOP
    INSERT INTO public.wallets_store (
      user_id, currency, network, address, provider
    )
    VALUES (
      p_user_id, v_currency, 'NATIVE', v_address, 'internal'
    )
    ON CONFLICT (user_id, currency) DO NOTHING;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- PART 4: Signup trigger function — provisions wallets on new user creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user_wallet_provisioning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.provision_fiat_wallets_for_user(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user_wallet_provisioning] Failed for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_user_provision_wallets ON public.profiles;
CREATE TRIGGER on_new_user_provision_wallets
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_wallet_provisioning();

-- ---------------------------------------------------------------------------
-- PART 5: One-time backfill RPC — run once after migration to fill gaps
-- SELECT user_id, wallets_created FROM provision_missing_fiat_wallets_for_all_users();
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_missing_fiat_wallets_for_all_users()
RETURNS TABLE(user_id UUID, wallets_created INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_before INT;
  v_after INT;
BEGIN
  FOR v_user IN
    SELECT id FROM public.profiles ORDER BY created_at
  LOOP
    SELECT COUNT(*) INTO v_before
    FROM public.wallets_store
    WHERE wallets_store.user_id = v_user.id
      AND currency = ANY(ARRAY[
        'NGN','USD','EUR','GBP','CAD','GHS','KES','TZS','UGX','ZAR',
        'XOF','MWK','RWF','XAF','ZMW','EGP','CNY','CNH','USDT','USDC','CNGN'
      ]);

    PERFORM public.provision_fiat_wallets_for_user(v_user.id);

    SELECT COUNT(*) INTO v_after
    FROM public.wallets_store
    WHERE wallets_store.user_id = v_user.id
      AND currency = ANY(ARRAY[
        'NGN','USD','EUR','GBP','CAD','GHS','KES','TZS','UGX','ZAR',
        'XOF','MWK','RWF','XAF','ZMW','EGP','CNY','CNH','USDT','USDC','CNGN'
      ]);

    user_id := v_user.id;
    wallets_created := v_after - v_before;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMIT;
