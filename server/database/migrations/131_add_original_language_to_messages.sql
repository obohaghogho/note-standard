-- ============================================================
-- Migration 131: Add original_language and updated_at to messages
--
-- Problem: chatController.js tries to insert original_language 
-- but the column was never created in previous migrations. The 
-- fallback retry also includes this column, leading to a 500 error.
-- ============================================================

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS original_language TEXT DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
