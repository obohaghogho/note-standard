-- ============================================================
-- Migration 130: Add is_muted column to conversation_members
--
-- Problem: chatController.js selects and updates is_muted on
-- conversation_members but the column was never created, causing
-- a Postgres 42703 "column does not exist" error that propagated
-- into a 500 on POST /api/chat/conversations/:id/messages.
-- ============================================================

ALTER TABLE conversation_members
    ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE;

-- Index: useful when server queries for non-muted members
CREATE INDEX IF NOT EXISTS idx_conversation_members_is_muted
    ON conversation_members (conversation_id, is_muted)
    WHERE is_muted = FALSE;
