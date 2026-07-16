-- ============================================================================
-- Migration 185: Prevent Lease Fighting in Development
-- ============================================================================
-- Purpose:
--   Updates the acquire_shard_lease_absolute RPC to only allow takeover
--   if the current lease is actually expired. This prevents multiple
--   worker processes from fighting over the same shard in dev environments.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION acquire_shard_lease_absolute(
    p_shard_id INT,
    p_worker_id UUID,
    p_epoch_token UUID
)
RETURNS TABLE (
    lease_id UUID,
    epoch_version BIGINT,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_epoch BIGINT;
    v_expires_at TIMESTAMPTZ := NOW() + interval '1 minute';
BEGIN
    UPDATE system_shard_leases
    SET owner_id = p_worker_id,
        epoch_version = epoch_version + 1,
        active_epoch_token = p_epoch_token,
        expires_at = v_expires_at,
        last_heartbeat = NOW()
    WHERE shard_id = p_shard_id
      AND (owner_id IS NULL OR expires_at < NOW() OR owner_id = p_worker_id)
    RETURNING epoch_version INTO v_new_epoch;

    -- Return the actual state (if update failed, v_new_epoch will be null)
    IF v_new_epoch IS NULL THEN
        RETURN QUERY 
        SELECT active_epoch_token, epoch_version, system_shard_leases.expires_at 
        FROM system_shard_leases 
        WHERE shard_id = p_shard_id;
    ELSE
        RETURN QUERY SELECT p_epoch_token, v_new_epoch, v_expires_at;
    END IF;
END;
$$;

COMMIT;
