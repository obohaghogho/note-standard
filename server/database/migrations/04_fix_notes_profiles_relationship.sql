-- Fix relationship between notes and profiles for embedding
-- This is necessary for queries like: select(*, owner:profiles(*))

-- Add foreign key from notes.owner_id to profiles.id
-- We use 'notes_owner_id_profiles_fk' as the constraint name to be explicit,
-- generally PostgREST uses the column name or constraint name for embedding.
ALTER TABLE notes
ADD CONSTRAINT notes_owner_id_profiles_fk
FOREIGN KEY (owner_id)
REFERENCES profiles (id)
ON DELETE CASCADE;
