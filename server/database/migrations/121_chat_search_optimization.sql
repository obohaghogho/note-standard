-- Enable pg_trgm for fuzzy search if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN index for high-performance message content search (ilike)
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin (content gin_trgm_ops);
