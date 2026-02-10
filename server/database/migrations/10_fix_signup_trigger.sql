-- Redefine the handle_new_user function to capture metadata
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, username, full_name, avatar_url)
  values (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;
