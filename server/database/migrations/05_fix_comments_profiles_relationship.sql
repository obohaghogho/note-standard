-- Fix relationship between comments and profiles for embedding
-- This is necessary for queries like: select(*, profile:profiles!user_id (*))

-- Add foreign key from comments.user_id to profiles.id
ALTER TABLE comments
ADD CONSTRAINT comments_user_id_profiles_fk
FOREIGN KEY (user_id)
REFERENCES profiles (id)
ON DELETE CASCADE;
