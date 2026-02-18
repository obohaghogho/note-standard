-- ====================================
-- FIX TEAM PROFILES RELATIONSHIPS
-- Allows PostgREST to resolve joins for team members, messages, and shared notes
-- ====================================

-- 1. Fix relationship for team_members
-- Allows joining team_members.user_id with profiles.id
ALTER TABLE team_members
DROP CONSTRAINT IF EXISTS team_members_user_id_profiles_fkey,
ADD CONSTRAINT team_members_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 2. Fix relationship for team_messages
-- Allows joining team_messages.sender_id with profiles.id
ALTER TABLE team_messages
DROP CONSTRAINT IF EXISTS team_messages_sender_id_profiles_fkey,
ADD CONSTRAINT team_messages_sender_id_profiles_fkey
FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 3. Fix relationship for shared_notes
-- Allows joining shared_notes.shared_by with profiles.id
ALTER TABLE shared_notes
DROP CONSTRAINT IF EXISTS shared_notes_shared_by_profiles_fkey,
ADD CONSTRAINT shared_notes_shared_by_profiles_fkey
FOREIGN KEY (shared_by) REFERENCES profiles(id) ON DELETE CASCADE;
