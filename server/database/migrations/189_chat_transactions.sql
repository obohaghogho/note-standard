-- Migration 189: Transactional Chat RPCs & Constraints

BEGIN;

-- 1. Enforce Sequence Constraints (Strict Database Validations)
-- Drop constraints if they exist to allow idempotency when re-running
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_event_id_key;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conv_seq_key;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_seq_positive;

-- Backfill sequence_number for existing messages to avoid unique constraint violations
WITH numbered_messages AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at ASC) as new_seq
    FROM messages
)
UPDATE messages m
SET sequence_number = nm.new_seq
FROM numbered_messages nm
WHERE m.id = nm.id AND (m.sequence_number = 0 OR m.sequence_number IS NULL);

-- Backfill event_id for existing messages to avoid unique constraint violations
UPDATE messages SET event_id = gen_random_uuid() WHERE event_id IS NULL;

ALTER TABLE messages 
ADD CONSTRAINT messages_event_id_key UNIQUE (event_id),
ADD CONSTRAINT messages_conv_seq_key UNIQUE (conversation_id, sequence_number),
ADD CONSTRAINT messages_seq_positive CHECK (sequence_number > 0);

-- 2. Create helper to get next sequence and increment conversation version atomically
CREATE OR REPLACE FUNCTION increment_conversation_version(conv_id UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    new_version BIGINT;
BEGIN
    UPDATE conversations
    SET version = version + 1, last_mutation_at = NOW()
    WHERE id = conv_id
    RETURNING version INTO new_version;
    
    RETURN new_version;
END;
$$;

-- 3. Transactional Send Message
CREATE OR REPLACE FUNCTION rpc_send_message(
    p_conversation_id UUID,
    p_sender_id UUID,
    p_content TEXT,
    p_type TEXT,
    p_event_id UUID,
    p_original_language TEXT DEFAULT 'en',
    p_attachment_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_message JSONB;
    v_seq BIGINT;
    v_version BIGINT;
    v_msg_id UUID;
    v_member_id UUID;
BEGIN
    -- Idempotency Check: Return existing if event_id already processed
    IF p_event_id IS NOT NULL THEN
        SELECT to_jsonb(m) INTO v_message FROM messages m WHERE event_id = p_event_id LIMIT 1;
        IF v_message IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'message', v_message, 'is_duplicate', true);
        END IF;
    END IF;

    -- Calculate next sequence safely using max + 1 (handles gaps, but locks rows safely)
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
    FROM messages WHERE conversation_id = p_conversation_id FOR UPDATE;

    -- Increment conversation version
    v_version := increment_conversation_version(p_conversation_id);

    -- Insert Message
    INSERT INTO messages (
        conversation_id, sender_id, content, type, event_id, sequence_number, 
        conversation_version, original_language, attachment_id
    ) VALUES (
        p_conversation_id, p_sender_id, p_content, p_type, p_event_id, v_seq, 
        v_version, p_original_language, p_attachment_id
    ) RETURNING id INTO v_msg_id;

    -- Atomically update unread counts for ALL OTHER members
    FOR v_member_id IN 
        SELECT user_id FROM conversation_members 
        WHERE conversation_id = p_conversation_id AND user_id != p_sender_id 
    LOOP
        INSERT INTO conversation_unread_state (conversation_id, user_id, unread_count, last_reconciled_at)
        VALUES (p_conversation_id, v_member_id, 1, NOW())
        ON CONFLICT (conversation_id, user_id) 
        DO UPDATE SET unread_count = conversation_unread_state.unread_count + 1, last_reconciled_at = NOW();
    END LOOP;

    -- Audit Log
    INSERT INTO message_audit_logs (message_id, conversation_id, sender_id, event_type, server_timestamp)
    VALUES (v_msg_id, p_conversation_id, p_sender_id, 'sent', NOW());

    -- Return the newly inserted row
    SELECT to_jsonb(m) INTO v_message FROM messages m WHERE id = v_msg_id;
    RETURN jsonb_build_object('success', true, 'message', v_message, 'is_duplicate', false);
END;
$$;

-- 4. Transactional Delete Message
CREATE OR REPLACE FUNCTION rpc_delete_message(
    p_message_id UUID,
    p_sender_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_conv_id UUID;
    v_version BIGINT;
    v_is_deleted BOOLEAN;
BEGIN
    SELECT conversation_id, is_deleted INTO v_conv_id, v_is_deleted 
    FROM messages WHERE id = p_message_id AND sender_id = p_sender_id FOR UPDATE;

    IF v_conv_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message not found or unauthorized');
    END IF;

    IF v_is_deleted THEN
        RETURN jsonb_build_object('success', true, 'is_duplicate', true);
    END IF;

    v_version := increment_conversation_version(v_conv_id);

    UPDATE messages SET is_deleted = true, conversation_version = v_version WHERE id = p_message_id;

    INSERT INTO message_audit_logs (message_id, conversation_id, sender_id, event_type)
    VALUES (p_message_id, v_conv_id, p_sender_id, 'deleted');

    RETURN jsonb_build_object('success', true, 'conversation_version', v_version);
END;
$$;

-- 5. Transactional Clear Chat
CREATE OR REPLACE FUNCTION rpc_clear_chat(
    p_conversation_id UUID,
    p_user_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_version BIGINT;
    v_cleared_at TIMESTAMPTZ;
BEGIN
    v_version := increment_conversation_version(p_conversation_id);
    v_cleared_at := NOW();

    UPDATE conversation_members 
    SET cleared_at = v_cleared_at 
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

    -- Reset unread state since chat is cleared
    UPDATE conversation_unread_state 
    SET unread_count = 0, last_reconciled_at = NOW()
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'cleared_at', v_cleared_at, 'conversation_version', v_version);
END;
$$;

-- 6. Transactional Mark Read
CREATE OR REPLACE FUNCTION rpc_mark_read(
    p_conversation_id UUID,
    p_user_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_version BIGINT;
BEGIN
    v_version := increment_conversation_version(p_conversation_id);

    UPDATE conversation_unread_state 
    SET unread_count = 0, last_reconciled_at = NOW()
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

    UPDATE messages 
    SET read_at = NOW() 
    WHERE conversation_id = p_conversation_id AND sender_id != p_user_id AND read_at IS NULL;

    RETURN jsonb_build_object('success', true, 'conversation_version', v_version);
END;
$$;

COMMIT;
