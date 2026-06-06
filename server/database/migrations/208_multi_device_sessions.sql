-- server/database/migrations/208_multi_device_sessions.sql

create table user_devices (
  id uuid default uuid_generate_v4() primary key,
  device_id uuid unique not null,
  user_id uuid references auth.users on delete cascade not null,
  platform text,
  push_token text,
  last_seen timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table user_sessions (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid unique not null,
  user_id uuid references auth.users on delete cascade not null,
  device_id uuid references user_devices(device_id) on delete cascade not null,
  refresh_token_hash text not null,
  token_state text check (token_state in ('valid', 'stale', 'invalid', 'revoked')) default 'valid',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_active timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone
);

create index idx_user_sessions_user_id on user_sessions(user_id);
create index idx_user_sessions_device_id on user_sessions(device_id);
create index idx_user_sessions_session_id on user_sessions(session_id);
create index idx_user_devices_user_id on user_devices(user_id);
create index idx_user_devices_device_id on user_devices(device_id);

alter table user_devices enable row level security;
alter table user_sessions enable row level security;

-- RLS Policies
create policy "Users can view own devices" 
  on user_devices for select 
  using (auth.uid() = user_id);

create policy "Users can update own devices" 
  on user_devices for update 
  using (auth.uid() = user_id);

create policy "Users can insert own devices" 
  on user_devices for insert 
  with check (auth.uid() = user_id);

create policy "Users can view own sessions" 
  on user_sessions for select 
  using (auth.uid() = user_id);

create policy "Users can update own sessions" 
  on user_sessions for update 
  using (auth.uid() = user_id);

create policy "Users can insert own sessions" 
  on user_sessions for insert 
  with check (auth.uid() = user_id);

-- Trigger to notify realtime gateway on session revocation
create or replace function notify_session_revoked() returns trigger as $$
begin
  if NEW.token_state = 'revoked' and OLD.token_state != 'revoked' then
    perform pg_notify('realtime_events', json_build_object(
      'event', 'session:revoked',
      'sessionId', NEW.session_id
    )::text);
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger tr_notify_session_revoked
after update on user_sessions
for each row execute function notify_session_revoked();
