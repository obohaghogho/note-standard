-- Migration 200: Reply threading — indexes, FK naming, and sender_name resolution
-- Depends on: Migration 199 (reply_to_id column + rpc_send_message update)
--
-- Purpose:
--   1. Explicitly name the reply_to_id FK constraint so PostgREST can resolve
--      the self-referencing join using `reply_to:messages!reply_to_id(...)`.
--   2. Add a performance index on reply_to_id for fast parent lookups.
--   3. Add a GIN index on conversation_id + reply_to_id for thread queries.
--   4. Update rpc_send_message to return sender_name in the reply_to fragment.

BEGIN;

-- ── 1. Ensure reply_to_id column exists (idempotent guard) ──────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID;

-- ── 2. Name the FK constraint explicitly ───────────────────────────────────
-- Drop the auto-generated constraint first (if it exists under any name),
-- then re-add with a known name that PostgREST can use for join hints.
DO $$
BEGIN
  -- Remove any existing unnamed/auto-named FK on reply_to_id
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'messages'
      AND kcu.column_name = 'reply_to_id'
      AND rc.constraint_name <> 'messages_reply_to_id_fkey'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE messages DROP CONSTRAINT ' || rc.constraint_name
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON rc.constraint_name = kcu.constraint_name
      WHERE kcu.table_name = 'messages'
        AND kcu.column_name = 'reply_to_id'
        AND rc.constraint_name <> 'messages_reply_to_id_fkey'
      LIMIT 1
    );
  END IF;
END;
$$;

-- Add the explicitly-named FK (idempotent)
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_reply_to_id_fkey;

ALTER TABLE messages
  ADD CONSTRAINT messages_reply_to_id_fkey
  FOREIGN KEY (reply_to_id)
  REFERENCES messages(id)
  ON DELETE SET NULL;

-- ── 3. Performance indexes ──────────────────────────────────────────────────

-- Index for fast parent message lookups (used by _hydrateReplyTo IN query)
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id
  ON messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- Composite index: conversation + reply threading (used by getMessages fallback)
CREATE INDEX IF NOT EXISTS idx_messages_conv_reply
  ON messages (conversation_id, reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- ── 4. Update rpc_send_message to return sender_name in reply_to ───────────
-- Replaces the function created in migration 199, adding sender_name resolution.
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
    v_message     JSONB;
    v_reply_to    JSONB;
    v_seq         BIGINT;
    v_version     BIGINT;
    v_msg_id      UUID;
    v_member_id   UUID;
BEGIN
    -- Idempotency: return existing message if event_id already processed
    IF p_event_id IS NOT NULL THEN
        SELECT to_jsonb(m) INTO v_message
        FROM messages m
        WHERE m.event_id = p_event_id
        LIMIT 1;

        IF v_message IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success',      true,
                'message',      v_message,
                'is_duplicate', true
            );
        END IF;
    END IF;

    -- Sequence: max + 1 within the conversation (row-level lock)
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
    FROM messages
    WHERE conversation_id = p_conversation_id
    FOR UPDATE;

    -- Increment conversation version
    v_version := increment_conversation_version(p_conversation_id);

    -- Insert the new message
    INSERT INTO messages (
        conversation_id, sender_id, content, type, event_id,
        sequence_number, conversation_version, original_language,
        attachment_id, reply_to_id
    ) VALUES (
        p_conversation_id, p_sender_id, p_content, p_type, p_event_id,
        v_seq, v_version, p_original_language,
        p_attachment_id, p_reply_to_id
    )
    RETURNING id INTO v_msg_id;

    -- Atomically increment unread counts for all other members
    FOR v_member_id IN
        SELECT user_id FROM conversation_members
        WHERE conversation_id = p_conversation_id
          AND user_id != p_sender_id
    LOOP
        INSERT INTO conversation_unread_state
            (conversation_id, user_id, unread_count, last_reconciled_at)
        VALUES
            (p_conversation_id, v_member_id, 1, NOW())
        ON CONFLICT (conversation_id, user_id)
        DO UPDATE SET
            unread_count       = conversation_unread_state.unread_count + 1,
            last_reconciled_at = NOW();
    END LOOP;

    -- Audit log
    INSERT INTO message_audit_logs
        (message_id, conversation_id, sender_id, event_type, server_timestamp)
    VALUES
        (v_msg_id, p_conversation_id, p_sender_id, 'sent', NOW());

    -- Build reply_to fragment with sender_name if a parent message exists
    IF p_reply_to_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'id',           parent.id,
            'content',      parent.content,
            'sender_id',    parent.sender_id,
            'message_type', parent.type,
            'deleted',      parent.is_deleted,
            'sender_name',  COALESCE(prof.full_name, prof.username, 'Unknown')
        )
        INTO v_reply_to
        FROM messages parent
        LEFT JOIN profiles prof ON prof.id = parent.sender_id
        WHERE parent.id = p_reply_to_id;
    END IF;

    -- Return full message row + resolved reply_to fragment
    SELECT to_jsonb(m) INTO v_message FROM messages m WHERE id = v_msg_id;

    -- Merge reply_to into the returned payload
    IF v_reply_to IS NOT NULL THEN
        v_message := v_message || jsonb_build_object('reply_to', v_reply_to);
    END IF;

    RETURN jsonb_build_object(
        'success',      true,
        'message',      v_message,
        'is_duplicate', false
    );
END;
$$;

COMMIT;
