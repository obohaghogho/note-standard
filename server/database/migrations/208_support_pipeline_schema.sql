-- =============================================================================
-- Migration 208: Support Pipeline Architecture Overhaul
--
-- Features:
-- 1. Alters support_tickets to add claiming fields, escalation reason, and priority.
-- 2. Stored Function rpc_escalate_support_ticket: Atomic transaction for support escalation.
-- 3. Stored Function rpc_claim_support_ticket: Optimistic race-free ticket claim with TTL expiration.
-- =============================================================================

-- Step 1: Schema Updates on support_tickets
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='assigned_admin_id') THEN
        ALTER TABLE support_tickets ADD COLUMN assigned_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='claimed_at') THEN
        ALTER TABLE support_tickets ADD COLUMN claimed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='claim_expires_at') THEN
        ALTER TABLE support_tickets ADD COLUMN claim_expires_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='escalation_reason') THEN
        ALTER TABLE support_tickets ADD COLUMN escalation_reason TEXT DEFAULT 'UNKNOWN';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='priority') THEN
        ALTER TABLE support_tickets ADD COLUMN priority TEXT DEFAULT 'normal';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='category') THEN
        ALTER TABLE support_tickets ADD COLUMN category TEXT DEFAULT 'General';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='intent') THEN
        ALTER TABLE support_tickets ADD COLUMN intent TEXT DEFAULT 'General Request';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='confidence') THEN
        ALTER TABLE support_tickets ADD COLUMN confidence NUMERIC(5,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='ai_debug_metadata') THEN
        ALTER TABLE support_tickets ADD COLUMN ai_debug_metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_support_tickets_conversation_id ON support_tickets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_admin ON support_tickets(assigned_admin_id);

-- Step 2: Function rpc_escalate_support_ticket
DROP FUNCTION IF EXISTS rpc_escalate_support_ticket;

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
    v_now TIMESTAMPTZ := NOW();
    v_result JSONB;
BEGIN
    -- 1. Update conversation status to 'escalated'
    UPDATE conversations
    SET support_status = 'escalated',
        updated_at = v_now
    WHERE id = p_conversation_id;

    -- 2. Insert AI escalation notice message
    INSERT INTO messages (
        conversation_id,
        sender_id,
        content,
        type,
        event_id,
        created_at
    ) VALUES (
        p_conversation_id,
        p_bot_sender_id,
        p_bot_message_content,
        'text',
        gen_random_uuid()::text,
        v_now
    )
    RETURNING id INTO v_message_id;

    -- 3. Idempotency Check: check if open/active ticket exists for this conversation
    SELECT id INTO v_existing_ticket_id
    FROM support_tickets
    WHERE conversation_id = p_conversation_id
      AND status NOT IN ('resolved', 'closed')
    LIMIT 1;

    IF v_existing_ticket_id IS NOT NULL THEN
        -- Reuse existing active ticket
        UPDATE support_tickets
        SET priority = COALESCE(p_priority, priority),
            category = COALESCE(p_category, category),
            intent = COALESCE(p_intent, intent),
            confidence = COALESCE(p_confidence, confidence),
            escalation_reason = COALESCE(p_reason, escalation_reason),
            ai_debug_metadata = COALESCE(p_ai_debug_metadata, ai_debug_metadata),
            updated_at = v_now
        WHERE id = v_existing_ticket_id;
        v_ticket_id := v_existing_ticket_id;
    ELSE
        -- Insert new support ticket
        INSERT INTO support_tickets (
            conversation_id,
            customer_id,
            status,
            priority,
            category,
            intent,
            confidence,
            escalation_reason,
            ai_debug_metadata,
            created_at,
            updated_at
        ) VALUES (
            p_conversation_id,
            p_customer_id,
            'open',
            COALESCE(p_priority, 'normal'),
            COALESCE(p_category, 'General'),
            COALESCE(p_intent, 'General Request'),
            COALESCE(p_confidence, 0.00),
            COALESCE(p_reason, 'AI_CONFIDENCE_LOW'),
            COALESCE(p_ai_debug_metadata, '{}'::jsonb),
            v_now,
            v_now
        )
        RETURNING id INTO v_ticket_id;
    END IF;

    -- 4. Insert audit event
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
            'conversation_id', p_conversation_id,
            'message_id', v_message_id
        ),
        v_now
    );

    -- Build return object
    v_result := jsonb_build_object(
        'success', true,
        'ticket_id', v_ticket_id,
        'message_id', v_message_id,
        'conversation_id', p_conversation_id,
        'status', 'escalated'
    );

    RETURN v_result;
END;
$$;

-- Step 3: Function rpc_claim_support_ticket (Optimistic Concurrency Lock)
DROP FUNCTION IF EXISTS rpc_claim_support_ticket;

CREATE OR REPLACE FUNCTION rpc_claim_support_ticket(
    p_ticket_id UUID,
    p_admin_id UUID,
    p_ttl_minutes INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_expires_at TIMESTAMPTZ := NOW() + (p_ttl_minutes || ' minutes')::interval;
    v_updated_count INT;
    v_conv_id UUID;
    v_result JSONB;
BEGIN
    -- Conditional optimistic lock update:
    -- Ticket can be claimed ONLY IF assigned_admin_id is NULL OR claim_expires_at < NOW() OR already assigned to this admin
    UPDATE support_tickets
    SET assigned_admin_id = p_admin_id,
        claimed_at = v_now,
        claim_expires_at = v_expires_at,
        status = 'assigned',
        updated_at = v_now
    WHERE id = p_ticket_id
      AND (
          assigned_admin_id IS NULL
          OR claim_expires_at < v_now
          OR assigned_admin_id = p_admin_id
      )
    RETURNING conversation_id INTO v_conv_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
        -- Also update conversation status
        IF v_conv_id IS NOT NULL THEN
            UPDATE conversations
            SET support_status = 'pending',
                updated_at = v_now
            WHERE id = v_conv_id;
        END IF;

        v_result := jsonb_build_object(
            'success', true,
            'claimed', true,
            'ticket_id', p_ticket_id,
            'assigned_admin_id', p_admin_id,
            'claimed_at', v_now,
            'claim_expires_at', v_expires_at
        );
    ELSE
        v_result := jsonb_build_object(
            'success', false,
            'claimed', false,
            'ticket_id', p_ticket_id,
            'reason', 'TICKET_ALREADY_CLAIMED'
        );
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_escalate_support_ticket TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION rpc_claim_support_ticket TO service_role, authenticated;
