-- Migration 492: Auto-assign sequence_number for legacy insert path
--
-- Context:
--   - rpc_send_message (the transactional path) always assigns sequence_number
--     by atomically incrementing conversations.seq_counter (migration 209).
--   - The legacy direct-insert path (chatController.js fallback) sets
--     sequence_number = NULL explicitly, leaving those messages without a
--     sequence number. This causes the client-side merge engine to fall back
--     to timestamp-based ordering, which is non-deterministic at sub-second
--     granularity and produces the observed ordering inversions.
--
-- Fix:
--   BEFORE INSERT trigger on messages: when sequence_number IS NULL, atomically
--   increment conversations.seq_counter and use the returned value.
--   This makes the DB the authoritative source of sequence numbers for both
--   the RPC and legacy paths, without requiring any application code change.
--
-- Safety:
--   - Trigger runs BEFORE INSERT so the constraint CHECK (sequence_number > 0)
--     is satisfied with the auto-assigned value.
--   - Idempotent: CREATE OR REPLACE + DROP IF EXISTS on the trigger.
--   - No wallet, settlement, Fincra, or financial tables are touched.

BEGIN;

-- 1. Trigger function: assign sequence if missing
CREATE OR REPLACE FUNCTION messages_auto_assign_sequence()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_seq BIGINT;
BEGIN
    -- Only auto-assign when the application explicitly left sequence_number NULL
    -- (the legacy direct-insert path).  The RPC path always supplies a value.
    IF NEW.sequence_number IS NULL THEN
        UPDATE conversations
        SET seq_counter = COALESCE(seq_counter, 0) + 1,
            updated_at  = NOW()
        WHERE id = NEW.conversation_id
        RETURNING seq_counter INTO v_seq;

        IF v_seq IS NULL THEN
            -- Conversation row not found — rare edge case (race during conv creation).
            -- Fall back to MAX+1 scan so the message still gets a valid sequence.
            SELECT COALESCE(MAX(sequence_number), 0) + 1
            INTO v_seq
            FROM messages
            WHERE conversation_id = NEW.conversation_id;
        END IF;

        NEW.sequence_number := v_seq;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Attach trigger (idempotent: drop first, then create)
DROP TRIGGER IF EXISTS trg_messages_auto_sequence ON messages;

CREATE TRIGGER trg_messages_auto_sequence
    BEFORE INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION messages_auto_assign_sequence();

COMMIT;
