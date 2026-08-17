-- Migration 412: Add per-user is_deleted and deleted_at soft-deletion flags to conversation_members
-- Disambiguates per-user conversation deletion (is_deleted) from history clearing (cleared_at)

ALTER TABLE conversation_members 
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_members_user_deleted 
  ON conversation_members (user_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_conversation_members_conv_user_deleted 
  ON conversation_members (conversation_id, user_id, is_deleted);
