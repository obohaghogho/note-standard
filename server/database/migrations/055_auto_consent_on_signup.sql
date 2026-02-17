-- Migration: 055_auto_consent_on_signup.sql
-- Description: Update signup trigger so new users automatically have consent enabled.

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  -- 1. Insert Profile with consent enabled by default
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
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    true,
    timezone('utc', now())
  );

  -- 2. Handle Affiliate Referral
  v_referrer_id := (new.raw_user_meta_data->>'referrer_id')::uuid;
  IF v_referrer_id IS NOT NULL THEN
    INSERT INTO public.affiliate_referrals (referrer_user_id, referred_user_id)
    VALUES (v_referrer_id, new.id)
    ON CONFLICT (referred_user_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also update the column default so any other insertion path gets consent = true
ALTER TABLE profiles ALTER COLUMN user_consent SET DEFAULT true;
