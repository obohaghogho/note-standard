create or replace function public.handle_new_user() 
returns trigger as $$
declare
  v_referrer_id uuid;
begin
  -- 1. Insert Profile
  insert into public.profiles (
    id, 
    email, 
    username, 
    full_name, 
    avatar_url,
    user_consent,
    terms_accepted_at
  )
  values (
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
  if v_referrer_id is not null then
    insert into public.affiliate_referrals (referrer_user_id, referred_user_id)
    values (v_referrer_id, new.id)
    on conflict (referred_user_id) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer;
