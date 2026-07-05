-- ==========================================
-- PHASE 1: MESSAGE DELIVERY ARCHITECTURE
-- ==========================================

-- 1. Add delivery metadata columns to the messages table
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'read')),
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sequence_id BIGINT GENERATED ALWAYS AS IDENTITY;

-- 2. Index for offline delivery sync engine
CREATE INDEX IF NOT EXISTS idx_messages_delivery_status_conversation 
ON public.messages (conversation_id, delivery_status);

-- 3. Enhance message_receipts if not fully aligned
ALTER TABLE public.message_receipts
ADD COLUMN IF NOT EXISTS sequence_id BIGINT GENERATED ALWAYS AS IDENTITY;
