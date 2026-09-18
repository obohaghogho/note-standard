-- Migration 466: Fix handle_new_user() trigger function
-- Description: Removes non-existent updated_at column from subscriptions INSERT and wraps all steps in exception blocks.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- 1. Create Profile with Exception Handling
  BEGIN
    INSERT INTO public.profiles (id, email, username, full_name, user_consent, terms_accepted_at, updated_at)
    VALUES (
      new.id, 
      new.email, 
      LOWER(COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(md5(new.id::text), 1, 4))),
      COALESCE(new.raw_user_meta_data->>'full_name', ''),
      true,
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: Failed to create profile for user %: %', new.id, SQLERRM;
  END;

  -- 2. Create Default Free Subscription Row (subscriptions table has no updated_at column)
  BEGIN
    INSERT INTO public.subscriptions (user_id, status, plan_tier, plan, created_at)
    VALUES (new.id, 'active', 'free', 'free', now())
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: Failed to create default subscription for user %: %', new.id, SQLERRM;
  END;

  -- 3. Provision Wallets
  BEGIN
    PERFORM public.provision_fiat_wallets_for_user(new.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: Wallet provisioning failed for user %: %', new.id, SQLERRM;
  END;

  RETURN new;
END;
$function$;

COMMIT;
