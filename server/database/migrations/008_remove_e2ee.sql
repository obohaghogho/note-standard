-- Migration 008: Remove E2EE components and setup standard chat

-- 1. Drop Public Keys table (no longer needed)
DROP TABLE IF EXISTS public_keys;

-- 2. Update Conversation Members
ALTER TABLE conversation_members 
DROP COLUMN IF EXISTS encrypted_session_key;

-- 3. Update Messages
-- We need to add 'content' and remove encryption fields.
-- Data loss warning: Old encrypted messages will be lost (or unreadable).
DELETE FROM messages; -- Clear old messages as they are encrypted

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '';

ALTER TABLE messages
DROP COLUMN IF EXISTS encrypted_content,
DROP COLUMN IF EXISTS iv,
DROP COLUMN IF EXISTS sender_key_fingerprint;
