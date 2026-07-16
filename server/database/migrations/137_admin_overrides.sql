-- =========================================================================
-- MIGRATION 137: ADMIN SETTLEMENT OVERRIDES
-- Allows manual finalization bypassing time windows
-- =========================================================================

CREATE OR REPLACE FUNCTION admin_force_finalize_settlement(
    p_transaction_id UUID,
    p_admin_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_status TEXT;
    v_is_final BOOLEAN;
BEGIN
    -- 1. Verify Admin (simplified check - in production you'd check a role table)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: User not found in auth layer';
    END IF;

    -- 2. Lock and Check Transaction
    SELECT settlement_status INTO v_current_status
    FROM transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF v_current_status = 'FINALIZED_LEDGER' THEN
        RETURN; -- Already finalized
    END IF;

    -- 3. Update Transaction Status
    UPDATE transactions
    SET 
        settlement_status = 'FINALIZED_LEDGER',
        settlement_confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_transaction_id;

    -- 4. Update Ledger Entry
    UPDATE ledger_entries
    SET 
        is_final = true,
        settled_at = NOW()
    WHERE reference = p_transaction_id;

    -- 5. Log the override
    INSERT INTO audit_logs (reference, action, status, details)
    VALUES (
        p_transaction_id::text,
        'ADMIN_SETTLEMENT_OVERRIDE',
        'success',
        jsonb_build_object(
            'admin_id', p_admin_id,
            'reason', 'Manual override by administrator'
        )
    );

END;
$$;
