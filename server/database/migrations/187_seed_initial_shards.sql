-- ============================================================================
-- Migration 187: Seed Initial Shard Leases
-- ============================================================================
-- Purpose:
--   Ensures that shards 0, 1, 2, and 3 exist in the system_shard_leases table.
--   This is required for the causal_execution_queue foreign key constraint.
-- ============================================================================

BEGIN;

INSERT INTO system_shard_leases (shard_id, owner_id, epoch_version, active_epoch_token, expires_at, last_heartbeat)
VALUES 
(0, NULL, 0, NULL, NOW() - interval '1 minute', NOW() - interval '1 minute'),
(1, NULL, 0, NULL, NOW() - interval '1 minute', NOW() - interval '1 minute'),
(2, NULL, 0, NULL, NOW() - interval '1 minute', NOW() - interval '1 minute'),
(3, NULL, 0, NULL, NOW() - interval '1 minute', NOW() - interval '1 minute')
ON CONFLICT (shard_id) DO NOTHING;

COMMIT;
