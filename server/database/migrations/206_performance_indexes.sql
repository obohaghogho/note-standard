-- Performance Indexing for Realtime Messaging
-- Phase 5 Optimization

-- 1. Covering index for retrieving latest messages in a conversation efficiently.
-- Supports fetching the most recent N messages.
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at DESC);

-- 2. Partial index to quickly count/fetch unread messages per conversation.
-- Greatly speeds up unread badge calculation across all active chats.
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (conversation_id) WHERE delivery_status != 'read';

-- 3. Optimization for sequence number lookups (used by deduplication and delta syncs).
CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages (conversation_id, sequence_number DESC);
