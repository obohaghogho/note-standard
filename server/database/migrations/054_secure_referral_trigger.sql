-- Secure Referral Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  v_referrer_id UUID;
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
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false),
    (NEW.raw_user_meta_data->>'terms_accepted_at')::timestamp with time zone
  );

  -- 2. Handle Affiliate Referral (Safely)
  BEGIN
    v_referrer_id := (NEW.raw_user_meta_data->>'referrer_id')::UUID;
    
    -- Prevent self-referral
    IF v_referrer_id IS NOT NULL AND v_referrer_id <> NEW.id THEN
      -- Check if referrer exists to avoid FK error
      IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_referrer_id) THEN
        -- 1. Insert Referral Record
        INSERT INTO public.affiliate_referrals (referrer_user_id, referred_user_id)
        VALUES (v_referrer_id, NEW.id)
        ON CONFLICT (referred_user_id) DO NOTHING;

        -- 2. Insert Notification for Referrer
        INSERT INTO public.notifications (receiver_id, type, title, message, link)
        VALUES (
          v_referrer_id, 
          'referral_signup', 
          'New Referral Signup', 
          'Someone just signed up using your referral link!', 
          '/dashboard/affiliates'
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Failed to process referral for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
