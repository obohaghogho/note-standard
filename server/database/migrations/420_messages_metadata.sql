-- Migration 420: Add metadata JSONB column to messages
-- Purpose: Store structured context for special message types (e.g. status replies)
-- Safe for production: nullable column, no table rewrite, no default value

ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Index for querying messages by metadata type (e.g. find all status replies)
CREATE INDEX IF NOT EXISTS idx_messages_metadata_status_reply
  ON messages USING gin (metadata jsonb_path_ops)
  WHERE metadata IS NOT NULL;

COMMENT ON COLUMN messages.metadata IS 'Structured context for special message types. E.g. { status_reply: { status_id, media_url, media_type, ... } }';
