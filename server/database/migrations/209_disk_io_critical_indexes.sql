-- =============================================================================
-- Migration 209: Critical Disk I/O Reduction
--
-- PROBLEM: Supabase Disk I/O Budget exhaustion warning.
-- ROOT CAUSES identified by performance audit:
--   1. Full-table scans on messages WHERE read_at IS NULL (no covering index)
--   2. Full-table scans on messages WHERE delivered_at IS NULL (no index)
--   3. rpc_send_message uses FOR UPDATE on all conversation message rows
--   4. rpc_mark_read updates ALL unread messages (unbounded write set)
--
-- FIXES:
--   1. Partial indexes for read_at IS NULL and delivered_at IS NULL
--   2. Covering index for getMessages primary query (is_deleted = false)
--   3. Composite index on conversation_members (conversation_id, user_id)
--   4. Add seq_counter atomic column to conversations
--   5. Replace rpc_send_message FOR UPDATE with atomic counter UPDATE
--   6. Replace rpc_mark_read with LIMIT 200 bounded write
-- =============================================================================

BEGIN;

-- ─── 1. CRITICAL PARTIAL INDEXES ─────────────────────────────────────────────

-- Covers: markConversationRead, rpc_mark_read, unread message scans.
-- Before: full sequential scan of all messages in conversation.
-- After:  index-only scan of unread rows only.
CREATE INDEX IF NOT EXISTS idx_messages_read_at_null
  ON messages (conversation_id, sender_id)
  WHERE read_at IS NULL;

-- Covers: markConversationDelivered bulk UPDATE.
-- Before: full sequential scan of all messages per conversation.
-- After:  index-only scan of undelivered rows only.
CREATE INDEX IF NOT EXISTS idx_messages_delivered_null
  ON messages (conversation_id)
  WHERE delivered_at IS NULL;

-- Covers: per-sender message lookups (many places in chatController).
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON messages (sender_id);

-- ─── 2. COVERING INDEX FOR getMessages PRIMARY QUERY ─────────────────────────
-- Replaces the simple (conversation_id, created_at DESC) from migration 206
-- with a partial index that excludes soft-deleted messages entirely.
-- Supabase can satisfy the WHERE + ORDER BY from this index alone.
CREATE INDEX IF NOT EXISTS idx_messages_active_conv_created
  ON messages (conversation_id, created_at DESC)
  WHERE is_deleted = false;

-- ─── 3. CONVERSATION MEMBERS COMPOSITE INDEX ─────────────────────────────────
-- sendMessage currently queries conversation_members 3× per message.
-- This composite index ensures each lookup is an index-only scan.
CREATE INDEX IF NOT EXISTS idx_conv_members_conv_user
  ON conversation_members (conversation_id, user_id)
  INCLUDE (role, status, is_muted);

-- ─── 4. ATOMIC SEQUENCE COUNTER ON CONVERSATIONS ─────────────────────────────
-- Eliminates the FOR UPDATE MAX(sequence_number) pattern in rpc_send_message
-- which locks ALL rows in a conversation for every message send.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS seq_counter BIGINT DEFAULT 0;

-- Backfill existing conversations (safe: only updates nulls/zeros)
UPDATE conversations c
SET seq_counter = COALESCE((
    SELECT MAX(sequence_number)
    FROM messages m
    WHERE m.conversation_id = c.id
), 0)
WHERE seq_counter = 0 OR seq_counter IS NULL;

-- ─── 5. REPLACE rpc_send_message: ATOMIC COUNTER ─────────────────────────────
-- Replaces FOR UPDATE MAX(seq) scan with single-row atomic UPDATE.
-- Reduces per-send I/O from O(N messages in conv) to O(1).
DROP FUNCTION IF EXISTS rpc_send_message(UUID,UUID,TEXT,TEXT,UUID,TEXT,UUID,UUID);

CREATE OR REPLACE FUNCTION rpc_send_message(
    p_conversation_id  UUID,
    p_sender_id        UUID,
    p_content          TEXT,
    p_type             TEXT,
    p_event_id         UUID,
    p_original_language TEXT DEFAULT 'en',
    p_attachment_id    UUID DEFAULT NULL,
    p_reply_to_id      UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_message    JSONB;
    v_reply_to   JSONB;
    v_seq        BIGINT;
    v_version    BIGINT;
    v_msg_id     UUID;
    v_member_id  UUID;
BEGIN
    -- ── Idempotency: return existing if event_id already processed ────────────
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

    -- ── Atomic counter: single-row UPDATE replaces FOR UPDATE full-scan ───────
    -- This locks exactly ONE row (the conversation row) instead of locking
    -- ALL message rows in the conversation. Eliminates the dominant lock contention.
    UPDATE conversations
    SET seq_counter      = seq_counter + 1,
        version          = COALESCE(version, 0) + 1,
        last_mutation_at = NOW(),
        updated_at       = NOW()
    WHERE id = p_conversation_id
    RETURNING seq_counter, COALESCE(version, 1) INTO v_seq, v_version;

    -- ── Insert message ────────────────────────────────────────────────────────
    INSERT INTO messages (
        conversation_id, sender_id, content, type, event_id,
        sequence_number, conversation_version, original_language,
        attachment_id, reply_to_id
    ) VALUES (
        p_conversation_id, p_sender_id, p_content, p_type, p_event_id,
        v_seq, v_version, p_original_language,
        p_attachment_id, p_reply_to_id
    ) RETURNING id INTO v_msg_id;

    -- ── Atomic unread increment for other members ─────────────────────────────
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

    -- ── Audit log ─────────────────────────────────────────────────────────────
    INSERT INTO message_audit_logs
        (message_id, conversation_id, sender_id, event_type, server_timestamp)
    VALUES
        (v_msg_id, p_conversation_id, p_sender_id, 'sent', NOW());

    -- ── Resolve reply_to fragment (single-row lookup, covered by PK index) ────
    IF p_reply_to_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'id',          parent.id,
            'content',     parent.content,
            'sender_id',   parent.sender_id,
            'message_type',parent.type,
            'deleted',     parent.is_deleted,
            'sender_name', COALESCE(prof.full_name, prof.username, 'Unknown')
        )
        INTO v_reply_to
        FROM messages parent
        LEFT JOIN profiles prof ON prof.id = parent.sender_id
        WHERE parent.id = p_reply_to_id;
    END IF;

    -- ── Return full message row ────────────────────────────────────────────────
    SELECT to_jsonb(m) INTO v_message FROM messages m WHERE id = v_msg_id;

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

GRANT EXECUTE ON FUNCTION rpc_send_message(UUID,UUID,TEXT,TEXT,UUID,TEXT,UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_send_message(UUID,UUID,TEXT,TEXT,UUID,TEXT,UUID,UUID) TO authenticated;

-- ─── 6. REPLACE rpc_mark_read: BOUNDED WRITE ─────────────────────────────────
-- Old version: UPDATE messages WHERE read_at IS NULL (all-time, unbounded).
-- New version: scoped by cleared_at watermark + LIMIT 200.
-- The new idx_messages_read_at_null partial index makes this O(unread rows)
-- instead of O(all rows in conversation).
CREATE OR REPLACE FUNCTION rpc_mark_read(
    p_conversation_id UUID,
    p_user_id         UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_version    BIGINT;
    v_cleared_at TIMESTAMPTZ;
BEGIN
    -- Get user's cleared_at to scope the update window
    SELECT cleared_at INTO v_cleared_at
    FROM conversation_members
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id;

    -- Increment version (single-row UPDATE, cheap)
    UPDATE conversations
    SET version = COALESCE(version, 0) + 1, last_mutation_at = NOW()
    WHERE id = p_conversation_id
    RETURNING COALESCE(version, 1) INTO v_version;

    -- Reset unread counter (single-row UPSERT, very cheap)
    UPDATE conversation_unread_state
    SET unread_count = 0, last_reconciled_at = NOW()
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id;

    -- Bounded UPDATE: max 200 most-recent unread messages.
    -- Uses idx_messages_read_at_null to skip already-read rows.
    -- LIMIT prevents unbounded writes on high-volume conversations.
    UPDATE messages
    SET read_at = NOW()
    WHERE id IN (
        SELECT id FROM messages
        WHERE conversation_id = p_conversation_id
          AND sender_id != p_user_id
          AND read_at IS NULL
          AND (v_cleared_at IS NULL OR created_at > v_cleared_at)
        ORDER BY created_at DESC
        LIMIT 200
    );

    RETURN jsonb_build_object('success', true, 'conversation_version', v_version);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_mark_read(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_mark_read(UUID, UUID) TO authenticated;

COMMIT;
