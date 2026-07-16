-- Migration 120: Unified Signup Triggers
-- Restores profile details, handles referrals safely, and creates default wallets.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  v_referrer_id uuid;
  v_raw_referrer text;
BEGIN
  -- 1. Insert Profile
  INSERT INTO public.profiles (
    id, 
    email, 
    username, 
    full_name, 
    avatar_url,
    user_consent,
    terms_accepted_at
  )
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url',
    true,
    timezone('utc', now())
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. Handle Affiliate Referral
  v_raw_referrer := new.raw_user_meta_data->>'referrer_id';
  IF v_raw_referrer IS NOT NULL AND v_raw_referrer <> '' THEN
    BEGIN
        v_referrer_id := v_raw_referrer::uuid;
        INSERT INTO public.affiliate_referrals (referrer_user_id, referred_user_id)
        VALUES (v_referrer_id, new.id)
        ON CONFLICT (referred_user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Ignore invalid UUIDs to prevent signup crash
        RAISE WARNING 'Invalid referrer_id: %', v_raw_referrer;
    END;
  END IF;

  -- 3. Create Default Wallets (USD, BTC, ETH, USDT, USDC, NGN)
  INSERT INTO public.wallets_store (user_id, currency, network, balance, address)
  VALUES 
    (new.id, 'USD', 'native', 0, uuid_generate_v4()::text),
    (new.id, 'BTC', 'bitcoin', 0, uuid_generate_v4()::text),
    (new.id, 'ETH', 'ethereum', 0, uuid_generate_v4()::text),
    (new.id, 'USDT', 'TRC20', 0, uuid_generate_v4()::text),
    (new.id, 'USDC', 'ERC20', 0, uuid_generate_v4()::text),
    (new.id, 'NGN', 'native', 0, uuid_generate_v4()::text)
  ON CONFLICT (user_id, currency, network) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
