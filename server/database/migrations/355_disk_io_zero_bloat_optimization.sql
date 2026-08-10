-- =============================================================================
-- Migration 355: Supabase Disk I/O Budget Preservation & Zero-Bloat Optimization
--
-- PROBLEM: Supabase alert — Disk I/O Budget Depletion (project: tngcvgisfctggvivcnva)
-- ROOT CAUSES:
--   1. Full sequential table scans on `messages` for undelivered email fallback workers.
--   2. 2-Tuple reconnect cursor queries lacking composite (conversation_id, created_at, id) index.
--   3. `push_delivery_telemetry` unbounded table bloat consuming Disk I/O.
--
-- SOLUTIONS:
--   1. Create composite partial index for `unreadMessageEmailer` worker scans.
--   2. Create 3-tuple composite index for reconnect cursor & pagination queries.
--   3. Create table retention pruning function for telemetry to keep disk footprint minimal.
-- =============================================================================

BEGIN;

-- ─── 1. UNDELIVERED EMAIL FALLBACK WORKER INDEX ──────────────────────────────
-- Prevents full-table scans when unreadMessageEmailer runs every 5 mins.
CREATE INDEX IF NOT EXISTS idx_messages_undelivered_email_scan
  ON messages (created_at)
  WHERE delivered_at IS NULL AND email_sent = false;

-- ─── 2. RECONNECT DELTA CURSOR 3-TUPLE INDEX ────────────────────────────────
-- Optimizes after_created_at + after_message_id cursor pagination queries.
CREATE INDEX IF NOT EXISTS idx_messages_conv_cursor_3tuple
  ON messages (conversation_id, created_at DESC, id DESC)
  WHERE is_deleted = false;

-- ─── 3. CONVERSATION MEMBERS CLEARED_AT COVERING INDEX ───────────────────────
-- Speeds up rpc_mark_read and cleared_at watermark queries.
CREATE INDEX IF NOT EXISTS idx_conv_members_cleared_watermark
  ON conversation_members (conversation_id, user_id, cleared_at);

-- ─── 4. TELEMETRY AUTO-PRUNING FUNCTION ──────────────────────────────────────
-- Prevents push_delivery_telemetry from growing unbounded and exhausting Disk I/O.
CREATE OR REPLACE FUNCTION rpc_prune_old_telemetry()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM push_delivery_telemetry
    WHERE created_at < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_prune_old_telemetry() TO service_role;
GRANT EXECUTE ON FUNCTION rpc_prune_old_telemetry() TO authenticated;

COMMIT;
