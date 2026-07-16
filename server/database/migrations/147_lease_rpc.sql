-- =========================================================================
-- DETERMINISTIC LEASE ARBITRATION (RPC)
-- Ensures atomic epoch increment and exclusive fencing.
-- =========================================================================

CREATE OR REPLACE FUNCTION acquire_shard_lease_fenced(
    p_shard_id INT,
    p_worker_id UUID,
    p_lease_duration_ms INT
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
    v_new_lease_id UUID := gen_random_uuid();
    v_new_epoch BIGINT;
    v_expires_at TIMESTAMPTZ := NOW() + (p_lease_duration_ms || ' milliseconds')::interval;
BEGIN
    -- ATOMIC FENCE: Increment epoch on every acquisition.
    -- This instantly invalidates any old worker possessing the shard.
    UPDATE system_shard_leases
    SET owner_id = p_worker_id,
        epoch_version = epoch_version + 1,
        lease_id = v_new_lease_id,
        expires_at = v_expires_at,
        last_heartbeat = NOW()
    WHERE shard_id = p_shard_id
    RETURNING epoch_version, expires_at INTO v_new_epoch, v_expires_at;

    RETURN QUERY SELECT v_new_lease_id, v_new_epoch, v_expires_at;
END;
$$;
