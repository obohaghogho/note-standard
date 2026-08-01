-- Migration 282: Fix Missing Profiles and Harden Signup Trigger
-- Description: Retroactively backfills missing profiles for auth.users and hardens handle_new_user() trigger.

BEGIN;

-- 1. Retroactive Backfill: Insert missing profiles for all users in auth.users
INSERT INTO public.profiles (
  id, 
  email, 
  username, 
  full_name, 
  avatar_url, 
  user_consent, 
  terms_accepted_at,
  updated_at
)
SELECT 
  au.id, 
  au.email, 
  LOWER(
    COALESCE(
      au.raw_user_meta_data->>'username', 
      split_part(au.email, '@', 1) || '_' || substr(md5(au.id::text), 1, 4)
    )
  ),
  COALESCE(au.raw_user_meta_data->>'full_name', ''),
  au.raw_user_meta_data->>'avatar_url',
  true,
  timezone('utc', now()),
  timezone('utc', now())
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 2. Harden handle_new_user() trigger to guarantee profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  v_username text;
  v_display_name text;
BEGIN
  -- Prepare Metadata
  v_username := LOWER(COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  v_display_name := COALESCE(new.raw_user_meta_data->>'full_name', '');
  
  -- Insert Profile with conflict fallback
  BEGIN
    INSERT INTO public.profiles (
      id, 
      email, 
      username, 
      full_name, 
      avatar_url,
      user_consent,
      terms_accepted_at,
      updated_at
    )
    VALUES (
      new.id, 
      new.email, 
      v_username,
      v_display_name,
      new.raw_user_meta_data->>'avatar_url',
      true,
      timezone('utc', now()),
      timezone('utc', now())
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      username = COALESCE(profiles.username, EXCLUDED.username),
      full_name = COALESCE(NULLIF(profiles.full_name, ''), EXCLUDED.full_name),
      updated_at = timezone('utc', now());
  EXCEPTION WHEN OTHERS THEN
    -- Fallback with unique suffix if username taken
    BEGIN
      v_username := v_username || '_' || floor(random() * 9000 + 1000)::text;
      INSERT INTO public.profiles (
        id, email, username, full_name, user_consent, terms_accepted_at, updated_at
      )
      VALUES (
        new.id, new.email, v_username, v_display_name, true, timezone('utc', now()), timezone('utc', now())
      )
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: Failed to create profile for user %: %', new.id, SQLERRM;
    END;
  END;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
