-- ==========================================
-- PHASE 6.2: EVENT LEDGER
-- ==========================================

-- 1. Create message_events table (Append-only Truth Layer)
CREATE TABLE IF NOT EXISTS public.message_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core references
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,

    -- Actor identity (device-level truth)
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    session_id UUID,

    -- Event tracing
    event_type TEXT NOT NULL, 
    -- SENT | DELIVERED | READ | LEASE_TAKEN | LEASE_RELEASED | RETRY | FAILED

    -- Correlation chain (CRITICAL)
    correlation_id UUID NOT NULL,

    -- Ordering guarantees per conversation
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Optional metadata payload
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for scale and tracing
CREATE INDEX IF NOT EXISTS idx_message_events_message ON public.message_events(message_id);
CREATE INDEX IF NOT EXISTS idx_message_events_conversation ON public.message_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_events_correlation ON public.message_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_message_events_device ON public.message_events(device_id);
CREATE INDEX IF NOT EXISTS idx_message_events_created ON public.message_events(created_at DESC);

-- Enable RLS
ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view events for conversations they are members of
CREATE POLICY "Users can view events for their conversations"
    ON public.message_events FOR SELECT
    USING (
        conversation_id IN (
            SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can only insert their own device events
CREATE POLICY "Users can insert their own events"
    ON public.message_events FOR INSERT
    WITH CHECK (user_id = auth.uid());


-- 2. RPC for Event Emission (Centralized Validation Point)
CREATE OR REPLACE FUNCTION public.rpc_emit_message_event(
    p_message_id UUID,
    p_conversation_id UUID,
    p_user_id UUID,
    p_device_id TEXT,
    p_session_id UUID,
    p_event_type TEXT,
    p_correlation_id UUID,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.message_events (
        message_id,
        conversation_id,
        user_id,
        device_id,
        session_id,
        event_type,
        correlation_id,
        metadata
    )
    VALUES (
        p_message_id,
        p_conversation_id,
        p_user_id,
        p_device_id,
        p_session_id,
        p_event_type,
        p_correlation_id,
        p_metadata
    );
END;
$$;
