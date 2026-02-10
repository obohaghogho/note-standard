-- Add tags and is_favorite columns to notes table if they don't exist
do $$ 
begin 
  if not exists (select 1 from information_schema.columns where table_name = 'notes' and column_name = 'tags') then
    alter table notes add column tags text[] default array[]::text[];
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'notes' and column_name = 'is_favorite') then
    alter table notes add column is_favorite boolean default false;
  end if;
end $$;
