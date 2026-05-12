-- Add attachment_id to messages and team_messages if they don't exist
-- This ensures media support works on production databases

ALTER TABLE IF EXISTS messages 
ADD COLUMN IF NOT EXISTS attachment_id UUID REFERENCES media_attachments(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS team_messages 
ADD COLUMN IF NOT EXISTS attachment_id UUID REFERENCES media_attachments(id) ON DELETE SET NULL;

-- Also ensure media_attachments exists (should already, but for safety)
-- create table if not exists media_attachments (...); 

-- Update RLS for team_messages to ensure members can see attachments
-- (Implicitly handled if they can see the message and have access to media_attachments table)
