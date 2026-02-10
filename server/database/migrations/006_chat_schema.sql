-- Public Keys for E2EE
create table public_keys (
  user_id uuid references auth.users on delete cascade not null primary key,
  public_key text not null, -- Base64 encoded X25519 public key
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Conversations (Chats)
create table conversations (
  id uuid default uuid_generate_v4() primary key,
  type text check (type in ('direct', 'group')) not null default 'direct',
  name text, -- Optional for direct chats, required for groups usually but we'll leave it nullable
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Conversation Members
create table conversation_members (
  conversation_id uuid references conversations on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  role text check (role in ('admin', 'member')) default 'member',
  encrypted_session_key text, -- The conversation key encrypted with this user's public key (for groups) or shared secret? 
                              -- Plan: Per-conversation session key.
                              -- For direct chats: We might just derive a shared secret.
                              -- For group chats: Sender generates a random session key, encrypts it for every member using their public identity key + sender ephemeral key? 
                              -- SIMPLIFIED APPROACH for this MVP:
                              -- We will use "Sender Keys" or just a per-conversation key wrapped for each member.
                              -- Let's store the "Conversation Key" encrypted with the member's Identity Key.
                              -- This allows any member to decrypt the Conversation Key and then decrypt messages.
                              -- Sender must wrap this key for every recipient when creating the group or adding a member.
                              -- This field stores that wrapped key.
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (conversation_id, user_id)
);

-- Messages
create table messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references conversations on delete cascade not null,
  sender_id uuid references auth.users on delete cascade not null,
  encrypted_content text not null, -- AES-256-GCM ciphertext (Base64)
  iv text not null, -- IV for the content (Base64)
  sender_key_fingerprint text, -- Optional: helps identify which key was used if we rotate
  type text default 'text', -- text, image, file
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes
create index messages_conversation_id_idx on messages(conversation_id);
create index conversation_members_user_id_idx on conversation_members(user_id);
create index conversation_members_conversation_id_idx on conversation_members(conversation_id);

-- RLS
alter table public_keys enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

-- Policies

-- Public Keys
-- Everyone can read public keys (to start chats)
create policy "Everyone can read public keys" on public_keys for select using (true);
-- Users can insert/update their own key
create policy "Users can manage own public key" on public_keys for all using (auth.uid() = user_id);

-- Conversations
-- Users can view conversations they are members of
create policy "Members can view conversations" on conversations for select 
using (exists (select 1 from conversation_members where conversation_id = conversations.id and user_id = auth.uid()));

-- Conversation Members
-- Users can view members of their conversations
create policy "Members can view conversation members" on conversation_members for select
using (
  exists (
    select 1 from conversation_members cm 
    where cm.conversation_id = conversation_members.conversation_id 
    and cm.user_id = auth.uid()
  )
);

-- Messages
-- Members can view messages in their conversations
create policy "Members can view messages" on messages for select
using (
  exists (
    select 1 from conversation_members cm 
    where cm.conversation_id = messages.conversation_id 
    and cm.user_id = auth.uid()
  )
);

-- Members can insert messages into their conversations
create policy "Members can send messages" on messages for insert
with check (
  auth.uid() = sender_id and
  exists (
    select 1 from conversation_members cm 
    where cm.conversation_id = conversation_id 
    and cm.user_id = auth.uid()
  )
);
