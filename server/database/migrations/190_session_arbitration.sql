-- =========================
-- DEVICE SESSIONS
-- =========================

CREATE TABLE IF NOT EXISTS public.device_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    session_id UUID NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX idx_device_sessions_user ON public.device_sessions(user_id);
CREATE INDEX idx_device_sessions_session ON public.device_sessions(session_id);

-- =========================
-- CONVERSATION LEASES
-- =========================

CREATE TABLE IF NOT EXISTS public.conversation_leases (
    conversation_id UUID PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
    active_device_id TEXT,
    active_session_id UUID,
    last_message_at TIMESTAMP WITH TIME ZONE,
    last_writer_event_id TEXT,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conv_leases_device ON public.conversation_leases(active_device_id);
CREATE INDEX idx_conv_leases_activity ON public.conversation_leases(last_heartbeat_at);

-- =========================
-- RLS
-- =========================

ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sessions"
ON public.device_sessions
FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "Users can view leases for their conversations"
ON public.conversation_leases
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = conversation_leases.conversation_id
        AND cm.user_id = auth.uid()
    )
);

-- =========================
-- RPC: SESSION REGISTER
-- =========================
CREATE OR REPLACE FUNCTION register_device_session(
    p_user_id UUID,
    p_device_id TEXT,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_session_id UUID;
BEGIN

    INSERT INTO device_sessions (user_id, device_id, session_id, ip_address, user_agent)
    VALUES (p_user_id, p_device_id, gen_random_uuid(), p_ip_address, p_user_agent)
    ON CONFLICT (user_id, device_id)
    DO UPDATE SET
        last_seen_at = NOW(),
        is_active = true
    RETURNING session_id INTO v_session_id;

    RETURN jsonb_build_object('session_id', v_session_id);
END;
$$;

-- =========================
-- RPC: HEARTBEAT & ARBITRATION
-- =========================
CREATE OR REPLACE FUNCTION heartbeat_device_session(
    p_session_id UUID,
    p_device_id TEXT,
    p_active_conversations UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    conv_id UUID;
    v_last_message TIMESTAMPTZ;
    v_lease RECORD;
BEGIN

    -- update session heartbeat
    UPDATE device_sessions
    SET last_seen_at = NOW(),
        is_active = true
    WHERE session_id = p_session_id;

    -- iterate conversations
    FOREACH conv_id IN ARRAY p_active_conversations LOOP

        -- LOCK lease row (CRITICAL)
        SELECT *
        INTO v_lease
        FROM conversation_leases
        WHERE conversation_id = conv_id
        FOR UPDATE;

        -- get latest message timestamp
        SELECT COALESCE(MAX(created_at), NOW())
        INTO v_last_message
        FROM messages
        WHERE conversation_id = conv_id;

        -- lease expiration check
        IF v_lease IS NULL THEN
            INSERT INTO conversation_leases (
                conversation_id,
                active_device_id,
                active_session_id,
                last_message_at,
                last_heartbeat_at
            )
            VALUES (
                conv_id,
                p_device_id,
                p_session_id,
                v_last_message,
                NOW()
            );

        ELSEIF v_lease.last_heartbeat_at < NOW() - INTERVAL '60 seconds'
            OR v_last_message > v_lease.last_message_at THEN

            UPDATE conversation_leases
            SET active_device_id = p_device_id,
                active_session_id = p_session_id,
                last_message_at = v_last_message,
                last_heartbeat_at = NOW(),
                updated_at = NOW()
            WHERE conversation_id = conv_id;

        ELSEIF v_lease.active_session_id = p_session_id THEN

            UPDATE conversation_leases
            SET last_heartbeat_at = NOW()
            WHERE conversation_id = conv_id;

        END IF;

    END LOOP;

END;
$$;

-- =========================
-- RPC: FORCE TAKEOVER
-- =========================
CREATE OR REPLACE FUNCTION force_takeover_lease(
    p_conversation_id UUID,
    p_session_id UUID,
    p_device_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN

    UPDATE conversation_leases
    SET active_device_id = p_device_id,
        active_session_id = p_session_id,
        last_heartbeat_at = NOW(),
        updated_at = NOW()
    WHERE conversation_id = p_conversation_id;

END;
$$;

-- =========================
-- RPC: GET CONVERSATIONS
-- =========================
CREATE OR REPLACE FUNCTION get_conversation_leases(
    p_user_id UUID,
    p_conversation_ids UUID[]
)
RETURNS TABLE (
    conversation_id UUID,
    active_device_id TEXT,
    active_session_id UUID,
    last_heartbeat_at TIMESTAMPTZ
)
LANGUAGE sql
AS $$
    SELECT cl.conversation_id, cl.active_device_id, cl.active_session_id, cl.last_heartbeat_at
    FROM conversation_leases cl
    JOIN conversation_members cm
      ON cm.conversation_id = cl.conversation_id
    WHERE cm.user_id = p_user_id
      AND cl.conversation_id = ANY(p_conversation_ids);
$$;

-- =========================
-- RPC: CLEANUP STALE
-- =========================
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS VOID
LANGUAGE sql
AS $$
    DELETE FROM device_sessions
    WHERE last_seen_at < NOW() - INTERVAL '5 minutes';

    DELETE FROM conversation_leases
    WHERE last_heartbeat_at < NOW() - INTERVAL '2 minutes';
$$;

-- =========================
-- RPC: SEND MESSAGE WITH LEASE
-- =========================
CREATE OR REPLACE FUNCTION rpc_send_message_with_lease(
    p_event_id TEXT,
    p_conversation_id UUID,
    p_sender_id UUID,
    p_device_id TEXT,
    p_session_id UUID,
    p_content TEXT,
    p_message_type TEXT DEFAULT 'text'
)
RETURNS TABLE (
    id UUID,
    event_id TEXT,
    conversation_id UUID,
    sender_id UUID,
    content TEXT,
    created_at TIMESTAMPTZ,
    sequence_number BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_message_id UUID := gen_random_uuid();
    v_sequence BIGINT;
BEGIN

-- 1. IDENTITY INSERT
INSERT INTO messages (
    id,
    event_id,
    conversation_id,
    sender_id,
    content,
    message_type,
    created_at
)
VALUES (
    v_message_id,
    p_event_id,
    p_conversation_id,
    p_sender_id,
    p_content,
    p_message_type,
    NOW()
)
ON CONFLICT (event_id)
DO NOTHING;

-- Return existing if duplicate
IF FOUND = FALSE THEN
    RETURN QUERY
    SELECT * FROM messages WHERE messages.event_id = p_event_id;
    RETURN;
END IF;

-- 2. SEQUENCE GENERATION
SELECT COALESCE(MAX(messages.sequence_number), 0) + 1
INTO v_sequence
FROM messages
WHERE messages.conversation_id = p_conversation_id;

UPDATE messages
SET sequence_number = v_sequence
WHERE messages.event_id = p_event_id;

-- 3. LEASE TRANSFER
INSERT INTO conversation_leases (
    conversation_id,
    active_device_id,
    active_session_id,
    last_message_at,
    last_writer_event_id,
    updated_at
)
VALUES (
    p_conversation_id,
    p_device_id,
    p_session_id,
    NOW(),
    p_event_id,
    NOW()
)
ON CONFLICT (conversation_id)
DO UPDATE SET
    active_device_id = EXCLUDED.active_device_id,
    active_session_id = EXCLUDED.active_session_id,
    last_message_at = EXCLUDED.last_message_at,
    last_writer_event_id = EXCLUDED.last_writer_event_id,
    updated_at = NOW();

-- 4. RETURN CANONICAL MESSAGE
RETURN QUERY
SELECT *
FROM messages
WHERE messages.event_id = p_event_id;

END;
$$;
