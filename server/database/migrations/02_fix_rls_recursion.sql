-- Fix RLS Infinite Recursion
-- The issue is: querying 'notes' triggers 'shared_notes' policy, which queries 'notes' again.

-- 1. Create a helper function to check note ownership without triggering RLS
create or replace function get_note_owner(p_note_id uuid)
returns uuid
language sql
security definer
as $$
  select owner_id from notes where id = p_note_id;
$$;

-- 2. Update shared_notes policy to use the helper function
drop policy if exists "Owner can view share records" on shared_notes;

create policy "Owner can view share records" 
  on shared_notes for select 
  using (
    auth.uid() = get_note_owner(note_id)
  );

-- 3. Also update the insert/delete policies to be safe (though they might not recurse on select, better safe than sorry)
drop policy if exists "Owner can share notes" on shared_notes;
create policy "Owner can share notes" 
  on shared_notes for insert 
  with check (
    auth.uid() = get_note_owner(note_id)
  );

drop policy if exists "Owner can revoke share" on shared_notes;
create policy "Owner can revoke share" 
  on shared_notes for delete 
  using (
    auth.uid() = get_note_owner(note_id)
  );
