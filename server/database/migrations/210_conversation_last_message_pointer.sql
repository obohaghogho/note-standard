-- Migration 210: Add deterministic last-message pointer to conversations
-- Fixes: chatlist ordering under clock drift, delayed inserts, socket timing mismatch.
-- The chatlist MUST sort by this column — NOT by messages.created_at ORDER BY.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_message_id TEXT,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Back-fill from existing messages so the column is immediately correct.
UPDATE conversations c
SET
  last_message_id = m.id,
  last_message_at = m.created_at
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    id,
    created_at
  FROM messages
  WHERE is_deleted = FALSE
  ORDER BY conversation_id, created_at DESC
) m
WHERE c.id = m.conversation_id;

-- Index so ORDER BY last_message_at DESC is instant.
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON conversations (last_message_at DESC NULLS LAST);
