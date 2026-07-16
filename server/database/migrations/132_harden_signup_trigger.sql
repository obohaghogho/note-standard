-- Migration 132: Harden Signup Trigger
-- Adds improved error handling and ensures all required fields for wallets are present.

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  v_referrer_id uuid;
  v_raw_referrer text;
  v_username text;
  v_display_name text;
BEGIN
  -- 0. Prepare Metadata
  v_username := COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  v_display_name := COALESCE(new.raw_user_meta_data->>'full_name', '');
  
  -- 1. Insert Profile (Harden against existing usernames/ids)
  BEGIN
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
      v_username,
      v_display_name,
      new.raw_user_meta_data->>'avatar_url',
      true,
      timezone('utc', now())
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      username = EXCLUDED.username,
      full_name = EXCLUDED.full_name,
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    -- If username or other constraint is taken, try a fallback with random digits
    BEGIN
        v_username := v_username || floor(random() * 1000)::text;
        INSERT INTO public.profiles (id, email, username, full_name, user_consent, terms_accepted_at)
        VALUES (new.id, new.email, v_username, v_display_name, true, timezone('utc', now()))
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create profile for user %: %', new.id, SQLERRM;
    END;
  END;

  -- 2. Handle Affiliate Referral
  v_raw_referrer := new.raw_user_meta_data->>'referrer_id';
  IF v_raw_referrer IS NOT NULL AND v_raw_referrer <> '' AND v_raw_referrer <> 'null' THEN
    BEGIN
        v_referrer_id := v_raw_referrer::uuid;
        INSERT INTO public.affiliate_referrals (referrer_user_id, referred_user_id)
        VALUES (v_referrer_id, new.id)
        ON CONFLICT (referred_user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Invalid referrer_id during signup: %', v_raw_referrer;
    END;
  END IF;

  -- 3. Create Default Wallets (USD, BTC, ETH, USDT, USDC, NGN)
  -- Ensure network, provider and address are tracked.
  -- We explicitly include available_balance which was added in migration 036.
  BEGIN
    INSERT INTO public.wallets_store (user_id, currency, network, balance, available_balance, address)
    VALUES 
      (new.id, 'USD', 'native', 0, 0, uuid_generate_v4()::text),
      (new.id, 'BTC', 'bitcoin', 0, 0, uuid_generate_v4()::text),
      (new.id, 'ETH', 'ethereum', 0, 0, uuid_generate_v4()::text),
      (new.id, 'USDT', 'TRC20', 0, 0, uuid_generate_v4()::text),
      (new.id, 'USDC', 'ERC20', 0, 0, uuid_generate_v4()::text),
      (new.id, 'NGN', 'native', 0, 0, uuid_generate_v4()::text)
    ON CONFLICT (user_id, currency, network) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failing to create initial wallets for user %: %', new.id, SQLERRM;
  END;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
