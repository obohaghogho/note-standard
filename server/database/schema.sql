-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES (Publicly visible user profiles for sharing)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  email text,
  full_name text,
  avatar_url text,
  referrer_id uuid, -- Who referred this user
  preferences jsonb default '{"analytics": true, "offers": false, "partners": false}'::jsonb,
  terms_accepted_at timestamp with time zone,
  is_verified boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- NOTES (Core content)
create table notes (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references auth.users on delete cascade not null,
  title text,
  content text,
  is_private boolean default true,
  is_favorite boolean default false,
  tags text[] default array[]::text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- SHARED_NOTES (Many-to-many relationship for sharing)
create table shared_notes (
  id uuid default uuid_generate_v4() primary key,
  note_id uuid references notes on delete cascade not null,
  shared_with_user_id uuid references auth.users on delete cascade not null,
  permission text check (permission in ('read', 'edit')) default 'read',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(note_id, shared_with_user_id)
);

-- SUBSCRIPTIONS (Paystack sync)
create table subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  paystack_customer_code text,
  paystack_subscription_code text,
  paystack_transaction_reference text,
  paystack_email_token text,
  plan_tier text default 'free',
  charged_amount_ngn numeric, -- The actual amount charged in NGN
  exchange_rate numeric, -- The rate used (USD -> NGN)
  status text check (status in ('active', 'past_due', 'canceled', 'incomplete', 'non_renewing')) default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id)
);

-- INDEXES for performance
create index notes_owner_id_idx on notes(owner_id);
create index shared_notes_note_id_idx on shared_notes(note_id);
create index shared_notes_user_id_idx on shared_notes(shared_with_user_id);
create index profiles_username_idx on profiles(username);

-- RLS: Enable Row Level Security
alter table profiles enable row level security;
alter table notes enable row level security;
alter table shared_notes enable row level security;
alter table subscriptions enable row level security;

-- POLICIES

-- Profiles
-- 1. Everyone can read profiles (to find users to share with)
create policy "Public profiles are viewable by everyone" 
  on profiles for select 
  using (true);

-- 2. Users can insert their own profile
create policy "Users can insert their own profile" 
  on profiles for insert 
  with check (auth.uid() = id);

-- 3. Users can update own profile
create policy "Users can update own profile" 
  on profiles for update 
  using (auth.uid() = id);

-- Notes
-- 1. Users can view own notes
create policy "Users can view own notes" 
  on notes for select 
  using (auth.uid() = owner_id);

-- 2. Users can view shared notes (Complex policy using EXISTS)
create policy "Users can view shared notes" 
  on notes for select 
  using (
    exists (
      select 1 from shared_notes 
      where shared_notes.note_id = notes.id 
      and shared_notes.shared_with_user_id = auth.uid()
    )
  );

-- 3. Users can insert own notes
create policy "Users can insert own notes" 
  on notes for insert 
  with check (auth.uid() = owner_id);

-- 4. Users can update own notes
create policy "Users can update own notes" 
  on notes for update 
  using (auth.uid() = owner_id);

-- 5. Users can update shared notes if they have 'edit' permission
create policy "Users can edit shared notes" 
  on notes for update 
  using (
    exists (
      select 1 from shared_notes 
      where shared_notes.note_id = notes.id 
      and shared_notes.shared_with_user_id = auth.uid()
      and shared_notes.permission = 'edit'
    )
  );

-- 6. Users can delete own notes
create policy "Users can delete own notes" 
  on notes for delete 
  using (auth.uid() = owner_id);

-- Shared Notes
-- Helper function to break RLS recursion
create or replace function get_note_owner(p_note_id uuid)
returns uuid
language sql
security definer
as $$
  select owner_id from notes where id = p_note_id;
$$;

-- Shared Notes
-- 1. Owner of the note strategy: You can see who you shared with
create policy "Owner can view share records" 
  on shared_notes for select 
  using (
    auth.uid() = get_note_owner(note_id)
  );

-- 2. Recipient strategy: You can see what's shared with you
create policy "Recipient can view share records" 
  on shared_notes for select 
  using (auth.uid() = shared_with_user_id);

-- 3. Owner can insert share records (Share a note)
create policy "Owner can share notes" 
  on shared_notes for insert 
  with check (
    auth.uid() = get_note_owner(note_id)
  );

-- 4. Owner can delete share records (Revoke access)
create policy "Owner can revoke share" 
  on shared_notes for delete 
  using (
    auth.uid() = get_note_owner(note_id)
  );

-- Subscriptions
-- 1. Users can view own subscription
create policy "Users can view own subscription" 
  on subscriptions for select 
  using (auth.uid() = user_id);

-- TRIGGER: Auto-create profile on signup
-- This assumes Supabase Auth
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

-- Trigger the function every time a user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- DAILY STATS (Analytics)
create table daily_stats (
  date date primary key default current_date,
  total_active_users integer default 0,
  total_notes_created integer default 0,
  top_tags jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table daily_stats enable row level security;
create policy "Public can view anonymized stats" on daily_stats for select using (true);
