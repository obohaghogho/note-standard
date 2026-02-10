-- Create LIKES table
create table if not exists likes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  note_id uuid references notes on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, note_id)
);

-- Create COMMENTS table
create table if not exists comments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  note_id uuid references notes on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes
create index likes_note_id_idx on likes(note_id);
create index comments_note_id_idx on comments(note_id);

-- Enable RLS
alter table likes enable row level security;
alter table comments enable row level security;

-- Policies for LIKES
create policy "Everyone can view likes" 
  on likes for select 
  using (true);

create policy "Users can like notes" 
  on likes for insert 
  with check (auth.uid() = user_id);

create policy "Users can remove their like" 
  on likes for delete 
  using (auth.uid() = user_id);

-- Policies for COMMENTS
create policy "Everyone can view comments" 
  on comments for select 
  using (true);

create policy "Users can comment on notes" 
  on comments for insert 
  with check (auth.uid() = user_id);

-- Allow comment author OR note owner to delete comment
create policy "Users can delete their own or received comments" 
  on comments for delete 
  using (
    auth.uid() = user_id 
    or 
    exists (
      select 1 from notes 
      where notes.id = comments.note_id 
      and notes.owner_id = auth.uid()
    )
  );

-- Function to get comment count
create or replace function get_comment_count(p_note_id uuid)
returns bigint
language sql
stable
as $$
  select count(*) from comments where note_id = p_note_id;
$$;

-- Function to get like count
create or replace function get_like_count(p_note_id uuid)
returns bigint
language sql
stable
as $$
  select count(*) from likes where note_id = p_note_id;
$$;

-- Allow public access to public notes (is_private = false)
create policy "Public notes are viewable by everyone" 
  on notes for select 
  using (is_private = false);
