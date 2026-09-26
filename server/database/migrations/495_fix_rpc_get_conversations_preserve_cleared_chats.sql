-- =============================================================================
-- Migration 495: Fix rpc_get_conversations to preserve cleared conversations in chat list
-- =============================================================================
-- Purpose:
--   Removes the legacy WHERE NOT clause in rpc_get_conversations that incorrectly
--   filtered out direct conversations when last_message was NULL and cleared_at
--   was NOT NULL.
--
--   This ensures that clearing chat history clears messages from view, but keeps
--   the conversation and peer user/avatar in the user's chat list (WhatsApp-style).
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS rpc_get_conversations(UUID);

CREATE OR REPLACE FUNCTION rpc_get_conversations(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH
    -- Step 1: Get all conversation IDs the user belongs to (with membership data)
    user_memberships AS (
        SELECT
            cm.conversation_id,
            cm.role,
            cm.status,
            cm.cleared_at,
            cm.is_muted,
            cm.is_deleted,
            cm.deleted_at
        FROM conversation_members cm
        WHERE cm.user_id = p_user_id
          AND (cm.is_deleted IS NOT TRUE)  -- Exclude soft-deleted memberships
    ),

    -- Step 2: Get all conversations in one batch (excluding support chats)
    user_conversations AS (
        SELECT c.*
        FROM conversations c
        INNER JOIN user_memberships um ON um.conversation_id = c.id
        WHERE c.chat_type IS DISTINCT FROM 'support'
          AND c.name IS DISTINCT FROM 'Support Chat'
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%support team%')
    ),

    -- Step 3: Batch all members for all those conversations
    all_members AS (
        SELECT
            cm.conversation_id,
            jsonb_build_object(
                'user_id', cm.user_id,
                'role', cm.role,
                'status', cm.status,
                'profile', jsonb_build_object(
                    'id', p.id,
                    'username', p.username,
                    'full_name', p.full_name,
                    'avatar_url', p.avatar_url,
                    'is_verified', p.is_verified,
                    'plan_tier', p.plan_tier,
                    'is_online', p.is_online,
                    'show_online_status', p.show_online_status,
                    'last_seen', p.last_seen
                )
            ) AS member_json
        FROM conversation_members cm
        INNER JOIN user_conversations uc ON uc.id = cm.conversation_id
        LEFT JOIN profiles p ON p.id = cm.user_id
    ),

    -- Step 4: Aggregate members per conversation
    members_agg AS (
        SELECT
            conversation_id,
            jsonb_agg(member_json) AS members
        FROM all_members
        GROUP BY conversation_id
    ),

    -- Step 5: Get last message per conversation using LATERAL
    last_messages AS (
        SELECT DISTINCT ON (m.conversation_id)
            m.conversation_id,
            jsonb_build_object(
                'id', m.id,
                'content', m.content,
                'sender_id', m.sender_id,
                'created_at', m.created_at,
                'type', m.type,
                'read_at', m.read_at,
                'delivered_at', m.delivered_at
            ) AS last_message_json
        FROM messages m
        INNER JOIN user_conversations uc ON uc.id = m.conversation_id
        INNER JOIN user_memberships um ON um.conversation_id = m.conversation_id
        WHERE m.is_deleted = false
          AND (um.cleared_at IS NULL OR m.created_at > um.cleared_at)
        ORDER BY m.conversation_id, m.created_at DESC
    ),

    -- Step 6: Unread counts
    unread_counts AS (
        SELECT
            cus.conversation_id,
            cus.unread_count
        FROM conversation_unread_state cus
        INNER JOIN user_conversations uc ON uc.id = cus.conversation_id
        WHERE cus.user_id = p_user_id
    ),

    -- Step 7: Block relationships
    user_blocks_raw AS (
        SELECT blocker_id, blocked_id
        FROM user_blocks
        WHERE blocker_id = p_user_id OR blocked_id = p_user_id
    ),

    -- Step 8: Identify other member in direct conversations
    direct_other_members AS (
        SELECT
            cm.conversation_id,
            cm.user_id AS other_user_id
        FROM conversation_members cm
        INNER JOIN user_conversations uc ON uc.id = cm.conversation_id
        WHERE uc.type = 'direct'
          AND cm.user_id != p_user_id
    )

    -- Final assembly: NO exclusion of cleared direct conversations
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', uc.id,
            'type', uc.type,
            'name', uc.name,
            'chat_type', uc.chat_type,
            'support_status', uc.support_status,
            'updated_at', uc.updated_at,
            'created_at', uc.created_at,
            'membership', jsonb_build_object(
                'role', um.role,
                'status', um.status,
                'cleared_at', um.cleared_at,
                'is_deleted', COALESCE(um.is_deleted, false),
                'deleted_at', um.deleted_at,
                'joined_at', NULL
            ),
            'is_muted', COALESCE(um.is_muted, false),
            'members', COALESCE(ma.members, '[]'::jsonb),
            'last_message', lm.last_message_json,
            'unreadCount', COALESCE(unc.unread_count, 0),
            'isBlocked', CASE
                WHEN EXISTS (
                    SELECT 1 FROM user_blocks_raw ubr
                    INNER JOIN direct_other_members dom ON dom.conversation_id = uc.id
                    WHERE (ubr.blocker_id = p_user_id AND ubr.blocked_id = dom.other_user_id)
                       OR (ubr.blocker_id = dom.other_user_id AND ubr.blocked_id = p_user_id)
                ) THEN true ELSE false
            END,
            'blockedByMe', CASE
                WHEN EXISTS (
                    SELECT 1 FROM user_blocks_raw ubr
                    INNER JOIN direct_other_members dom ON dom.conversation_id = uc.id
                    WHERE ubr.blocker_id = p_user_id AND ubr.blocked_id = dom.other_user_id
                ) THEN true ELSE false
            END,
            'blockedByThem', CASE
                WHEN EXISTS (
                    SELECT 1 FROM user_blocks_raw ubr
                    INNER JOIN direct_other_members dom ON dom.conversation_id = uc.id
                    WHERE ubr.blocker_id = dom.other_user_id AND ubr.blocked_id = p_user_id
                ) THEN true ELSE false
            END
        )
        ORDER BY COALESCE(
            (lm.last_message_json->>'created_at')::timestamptz,
            uc.updated_at,
            uc.created_at
        ) DESC NULLS LAST
    )
    INTO v_result
    FROM user_conversations uc
    INNER JOIN user_memberships um ON um.conversation_id = uc.id
    LEFT JOIN members_agg ma ON ma.conversation_id = uc.id
    LEFT JOIN last_messages lm ON lm.conversation_id = uc.id
    LEFT JOIN unread_counts unc ON unc.conversation_id = uc.id;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_conversations(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_get_conversations(UUID) TO authenticated;

COMMIT;
