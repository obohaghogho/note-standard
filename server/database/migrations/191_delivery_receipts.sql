-- ==========================================
-- PHASE 6: DELIVERY GUARANTEES & RECEIPT TRACKING
-- ==========================================

-- 1. Create message_receipts table
CREATE TABLE IF NOT EXISTS public.message_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    
    lease_id UUID, -- Optional link to the lease held when reading
    
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(message_id, device_id)
);

-- Indexing for fast receipt queries by conversation and message
CREATE INDEX IF NOT EXISTS idx_message_receipts_conversation ON public.message_receipts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_receipts_message ON public.message_receipts(message_id);

-- Enable RLS
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view receipts for conversations they are members of
CREATE POLICY "Users can view receipts for their conversations"
    ON public.message_receipts FOR SELECT
    USING (
        conversation_id IN (
            SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can only insert/update their own device receipts
CREATE POLICY "Users can manage their own device receipts"
    ON public.message_receipts FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ==========================================
-- RPCs
-- ==========================================

-- RPC: rpc_mark_delivered
-- Called when a message arrives on a specific device
CREATE OR REPLACE FUNCTION public.rpc_mark_delivered(
    p_message_id UUID,
    p_device_id TEXT
) RETURNS JSON AS $$
DECLARE
    v_conversation_id UUID;
    v_user_id UUID;
    v_receipt public.message_receipts;
BEGIN
    -- Get message details
    SELECT conversation_id INTO v_conversation_id
    FROM public.messages WHERE id = p_message_id;
    
    IF v_conversation_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Message not found');
    END IF;

    v_user_id := auth.uid();

    -- Insert receipt with delivered_at. DO NOTHING on conflict to prevent UPDATE storms.
    INSERT INTO public.message_receipts (message_id, conversation_id, user_id, device_id, delivered_at)
    VALUES (p_message_id, v_conversation_id, v_user_id, p_device_id, NOW())
    ON CONFLICT (message_id, device_id) 
    DO NOTHING
    RETURNING * INTO v_receipt;

    -- If no row was inserted (conflict), retrieve the existing receipt to return it.
    IF v_receipt IS NULL THEN
        SELECT * INTO v_receipt 
        FROM public.message_receipts 
        WHERE message_id = p_message_id AND device_id = p_device_id;
    END IF;
    
    -- Optional aggregate fallback (for legacy clients)
    UPDATE public.messages
    SET delivered_at = NOW()
    WHERE id = p_message_id AND delivered_at IS NULL;

    RETURN json_build_object('success', true, 'receipt', row_to_json(v_receipt));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: rpc_mark_read
-- Called by the Active Writer to mark all messages up to a point as read
CREATE OR REPLACE FUNCTION public.rpc_mark_read(
    p_conversation_id UUID,
    p_device_id TEXT,
    p_last_message_id UUID
) RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
    v_lease public.conversation_leases;
    v_updated_count INT;
BEGIN
    v_user_id := auth.uid();

    -- PHASE 6 LEASE BARRIER:
    -- Only the active device can publish read receipts for the user.
    -- (If passive, client should queue the read intent).
    SELECT * INTO v_lease 
    FROM public.conversation_leases 
    WHERE conversation_id = p_conversation_id;

    IF v_lease.active_device_id != p_device_id THEN
        RETURN json_build_object('success', false, 'error', 'Passive device cannot broadcast read state', 'code', 'LEASE_PASSIVE');
    END IF;

    -- Update all receipts for this user + device in the conversation where message created_at <= last_message.created_at
    WITH target_messages AS (
        SELECT id FROM public.messages 
        WHERE conversation_id = p_conversation_id
          AND created_at <= (SELECT created_at FROM public.messages WHERE id = p_last_message_id)
          AND sender_id != v_user_id -- Only read other people's messages
    )
    INSERT INTO public.message_receipts (message_id, conversation_id, user_id, device_id, read_at)
    SELECT id, p_conversation_id, v_user_id, p_device_id, NOW()
    FROM target_messages
    ON CONFLICT (message_id, device_id) 
    DO UPDATE SET 
        read_at = COALESCE(public.message_receipts.read_at, EXCLUDED.read_at);

    -- Legacy fallback aggregate (mark conversation unread_count=0, etc.)
    UPDATE public.messages
    SET read_at = NOW()
    WHERE conversation_id = p_conversation_id
      AND sender_id != v_user_id
      AND created_at <= (SELECT created_at FROM public.messages WHERE id = p_last_message_id)
      AND read_at IS NULL;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
