-- Migration 174: Fincra Deterministic Idempotency & Row-Level Locking

-- 1. Create Partial Unique Index for Provider References
-- We use IS NOT NULL filter to avoid breaking internal transfers which may not have external providers
CREATE UNIQUE INDEX IF NOT EXISTS uniq_provider_ref 
ON transactions(provider, provider_reference) 
WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;

-- 2. Drop the old function explicitly to rewrite signature safely
DROP FUNCTION IF EXISTS confirm_deposit(UUID, UUID, DECIMAL, TEXT);

-- 3. Rewrite confirm_deposit with FOR UPDATE, PROCESSING compat, and Late-Payment Overrides
CREATE OR REPLACE FUNCTION confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount DECIMAL,
    p_external_hash TEXT DEFAULT NULL,
    p_override BOOLEAN DEFAULT FALSE,
    p_override_reason TEXT DEFAULT 'late_provider_success'
) RETURNS VOID AS $$
DECLARE
    current_status VARCHAR;
    current_metadata JSONB;
BEGIN
    -- ATOMIC ROW-LEVEL LOCK
    SELECT status, metadata INTO current_status, current_metadata
    FROM transactions 
    WHERE id = p_transaction_id 
    FOR UPDATE;

    -- FINALIZED GUARD (Already completed or cancelled)
    IF current_status IN ('COMPLETED', 'CANCELLED') THEN
        RETURN;
    END IF;

    -- LATE-PAYMENT OVERRIDE LOGIC
    IF current_status = 'FAILED' THEN
        IF p_override = TRUE THEN
            -- Add Audit Trail 
            UPDATE transactions 
            SET status = 'COMPLETED',
                external_hash = COALESCE(p_external_hash, external_hash),
                updated_at = NOW(),
                metadata = COALESCE(current_metadata, '{}'::jsonb) || jsonb_build_object(
                    'override_reason', p_override_reason,
                    'original_status', 'FAILED',
                    'overridden_at', NOW()
                )
            WHERE id = p_transaction_id;
            
            -- Credit Wallet
            UPDATE wallets 
            SET balance = balance + p_amount,
                updated_at = NOW()
            WHERE id = p_wallet_id;
        END IF;
        
        -- If failed and no override is flag true, we strictly exit.
        RETURN;
    END IF;

    -- STANDARD PENDING / PROCESSING FLOW
    IF current_status NOT IN ('PENDING', 'PROCESSING') THEN
        RETURN;
    END IF;

    -- Credit Wallet
    UPDATE wallets 
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Mark Transaction as Completed
    UPDATE transactions 
    SET status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        updated_at = NOW()
    WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
