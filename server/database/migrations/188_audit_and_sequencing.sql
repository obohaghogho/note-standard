-- Migration 188: Audit Tables & Event Sequencing
-- Adds infrastructure for fault-tolerant chat.

BEGIN;

-- 1. Sequence and Versioning for Messages
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS sequence_number BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS event_id UUID UNIQUE,
ADD COLUMN IF NOT EXISTS conversation_version BIGINT DEFAULT 1;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_seq_positive;
ALTER TABLE public.messages ADD CONSTRAINT messages_seq_positive CHECK (sequence_number >= 0);

DROP INDEX IF EXISTS messages_conv_seq_key;
CREATE UNIQUE INDEX messages_conv_seq_key ON public.messages (conversation_id, sequence_number) WHERE sequence_number > 0;

-- 2. Versioning for Conversations
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_mutation_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_mutation_source TEXT DEFAULT 'system';

-- 3. Audit Logs Table
CREATE TABLE IF NOT EXISTS message_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- e.g., 'sent', 'delivered', 'read', 'retry', 'reconciled'
    payload JSONB,
    server_timestamp TIMESTAMPTZ DEFAULT NOW(),
    client_timestamp TIMESTAMPTZ,
    status TEXT DEFAULT 'pending'
);

-- Index for fast audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_msg_id ON message_audit_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_conv_id ON message_audit_logs(conversation_id);

-- 4. Unread Counts Hardening (Optional Helper Table/View)
-- Helps ensure we don't rely entirely on the frontend or implicit row counts.
CREATE TABLE IF NOT EXISTS conversation_unread_state (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    unread_count INT DEFAULT 0,
    last_reconciled_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

COMMIT;
