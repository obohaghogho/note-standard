-- Migration 199: Add reply_to_id support to rpc_send_message
-- Fixes: replies not being stored in DB when SEQUENCE_ENFORCEMENT feature is active

BEGIN;

-- Ensure reply_to_id column exists on messages (idempotent)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Re-create rpc_send_message with p_reply_to_id parameter
CREATE OR REPLACE FUNCTION rpc_send_message(
    p_conversation_id UUID,
    p_sender_id UUID,
    p_content TEXT,
    p_type TEXT,
    p_event_id UUID,
    p_original_language TEXT DEFAULT 'en',
    p_attachment_id UUID DEFAULT NULL,
    p_reply_to_id UUID DEFAULT NULL
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

    -- Insert Message (now includes reply_to_id)
    INSERT INTO messages (
        conversation_id, sender_id, content, type, event_id, sequence_number,
        conversation_version, original_language, attachment_id, reply_to_id
    ) VALUES (
        p_conversation_id, p_sender_id, p_content, p_type, p_event_id, v_seq,
        v_version, p_original_language, p_attachment_id, p_reply_to_id
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

COMMIT;
