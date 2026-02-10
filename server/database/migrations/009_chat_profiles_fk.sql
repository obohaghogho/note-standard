-- Add foreign key from conversation_members.user_id to profiles.id
-- This allows PostgREST to resolve the relationship for joins (e.g. member:profiles(...))

ALTER TABLE conversation_members
ADD CONSTRAINT conversation_members_user_id_fkey_profiles
FOREIGN KEY (user_id) REFERENCES profiles(id);
