-- =============================================================================
-- Migration 212: fix_rpc_escalate_support_ticket
--
-- FIXES:
-- 1. Fixes type mismatch in rpc_escalate_support_ticket where gen_random_uuid()::text
--    was passed to column event_id (which is of type UUID).
-- 2. Calculates next sequence_number for conversation to satisfy messages_seq_positive constraint.
-- 3. Sets sender_type = 'ai' explicitly on the inserted AI escalation message.
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_escalate_support_ticket(
    p_conversation_id UUID,
    p_customer_id UUID,
    p_reason TEXT,
    p_priority TEXT,
    p_category TEXT,
    p_intent TEXT,
    p_confidence NUMERIC,
    p_ai_debug_metadata JSONB,
    p_bot_sender_id UUID,
    p_bot_message_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_ticket_id UUID;
    v_ticket_id UUID;
    v_message_id UUID;
    v_next_seq INT;
    v_now TIMESTAMPTZ := NOW();
    v_result JSONB;
BEGIN
    -- 1. Update conversation status to 'escalated'
    UPDATE conversations
    SET support_status = 'escalated',
        updated_at = v_now
    WHERE id = p_conversation_id;

    -- 2. Get next sequence_number for this conversation
    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO v_next_seq
    FROM messages
    WHERE conversation_id = p_conversation_id;

    -- 3. Insert AI escalation notice message
    INSERT INTO messages (
        conversation_id,
        sender_id,
        content,
        type,
        sender_type,
        sequence_number,
        event_id,
        created_at
    ) VALUES (
        p_conversation_id,
        p_bot_sender_id,
        p_bot_message_content,
        'text',
        'ai',
        v_next_seq,
        gen_random_uuid(),
        v_now
    )
    RETURNING id INTO v_message_id;

    -- 4. Idempotency Check: check if open/active ticket exists for this conversation
    SELECT id INTO v_existing_ticket_id
    FROM support_tickets
    WHERE conversation_id = p_conversation_id
      AND status NOT IN ('resolved', 'closed')
    LIMIT 1;

    IF v_existing_ticket_id IS NOT NULL THEN
        -- Update existing ticket with updated priority / intent / debug metadata
        UPDATE support_tickets
        SET priority = COALESCE(p_priority, priority),
            category = COALESCE(p_category, category),
            intent = COALESCE(p_intent, intent),
            confidence = COALESCE(p_confidence, confidence),
            ai_debug_metadata = p_ai_debug_metadata,
            updated_at = v_now
        WHERE id = v_existing_ticket_id;

        v_ticket_id := v_existing_ticket_id;
    ELSE
        -- Create new support ticket
        INSERT INTO support_tickets (
            conversation_id,
            customer_id,
            status,
            priority,
            category,
            intent,
            confidence,
            ai_debug_metadata,
            created_at,
            updated_at
        ) VALUES (
            p_conversation_id,
            p_customer_id,
            'open',
            COALESCE(p_priority, 'normal'),
            COALESCE(p_category, 'General'),
            COALESCE(p_intent, 'General Support'),
            COALESCE(p_confidence, 0.00),
            p_ai_debug_metadata,
            v_now,
            v_now
        )
        RETURNING id INTO v_ticket_id;
    END IF;

    -- 5. Record ticket audit log event
    INSERT INTO support_ticket_events (
        ticket_id,
        event_type,
        payload,
        created_at
    ) VALUES (
        v_ticket_id,
        'escalated',
        jsonb_build_object(
            'reason', p_reason,
            'priority', p_priority,
            'category', p_category,
            'confidence', p_confidence,
            'bot_message_id', v_message_id
        ),
        v_now
    );

    v_result := jsonb_build_object(
        'ticket_id', v_ticket_id,
        'message_id', v_message_id,
        'conversation_id', p_conversation_id,
        'status', 'escalated',
        'created_at', v_now
    );

    RETURN v_result;
END;
$$;
