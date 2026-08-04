-- 341_chat_performance_indexes.sql
-- High-Performance Composite Indexes for WhatsApp-Grade Messaging Engine

-- 1. Conversation message chronological sequence pagination
CREATE INDEX IF NOT EXISTS idx_messages_conv_seq_asc 
ON messages (conversation_id, sequence_number ASC)
WHERE is_deleted = false;

-- 2. Conversation message created_at cursor pagination
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc 
ON messages (conversation_id, created_at DESC)
WHERE is_deleted = false;

-- 3. Fast unread message lookup by recipient and conversation
CREATE INDEX IF NOT EXISTS idx_messages_unread_lookup
ON messages (conversation_id, sender_id)
WHERE read_at IS NULL AND is_deleted = false;

-- 4. Push Delivery Telemetry fast query index
CREATE INDEX IF NOT EXISTS idx_push_telemetry_recipient_created
ON push_delivery_telemetry (recipient_id, created_at DESC);

-- 5. Push Subscriptions active lookup
CREATE INDEX IF NOT EXISTS idx_push_subs_user_status
ON push_subscriptions (user_id, status)
WHERE status = 'healthy';
