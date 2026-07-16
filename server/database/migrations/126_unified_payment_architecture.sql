-- Migration 126: Unified Payment Architecture
-- Purpose: Enhance the payments table to serve as the single source of truth
--          for both Paystack and Grey payment flows. Add expiration, idempotency,
--          and sender tracking.

BEGIN;

-- 1. Add missing columns to payments table
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'paystack'
    CHECK (method IN ('paystack', 'grey'));

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS sender_name TEXT;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS verification_source TEXT
    CHECK (verification_source IN ('webhook', 'brevo_email', 'admin_manual', 'api_poll'));

-- 2. Index for expiration queries
CREATE INDEX IF NOT EXISTS idx_payments_expires_at
    ON public.payments(expires_at)
    WHERE status = 'pending' AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_method
    ON public.payments(method);

CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key
    ON public.payments(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 3. Enhanced expiration function (replaces the one from migration 100)
-- Marks pending payments as 'failed' after their expires_at window.
-- Returns number of expired records.
DROP FUNCTION IF EXISTS expire_pending_payments(integer);
CREATE OR REPLACE FUNCTION expire_pending_payments(p_expiry_minutes INT DEFAULT 60)
RETURNS TABLE(expired_count INT, expired_references TEXT[]) LANGUAGE plpgsql AS $$
DECLARE
    v_count INT;
    v_refs TEXT[];
BEGIN
    -- Expire by explicit expires_at column first
    WITH expired AS (
        UPDATE public.payments
        SET status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'expiry_reason', 'Auto-expired: payment window closed',
                'expired_at', NOW()::text
            ),
            updated_at = NOW()
        WHERE status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
        RETURNING reference
    )
    SELECT ARRAY_AGG(reference), COUNT(*)::INT
    INTO v_refs, v_count
    FROM expired;

    -- Also expire any very old pending payments without expires_at (safety net)
    WITH old_expired AS (
        UPDATE public.payments
        SET status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'expiry_reason', format('Auto-expired: older than %s minutes', p_expiry_minutes),
                'expired_at', NOW()::text
            ),
            updated_at = NOW()
        WHERE status = 'pending'
        AND expires_at IS NULL
        AND created_at < NOW() - (p_expiry_minutes * INTERVAL '1 minute')
        RETURNING reference
    )
    SELECT
        COALESCE(v_refs, ARRAY[]::TEXT[]) || COALESCE(ARRAY_AGG(reference), ARRAY[]::TEXT[]),
        v_count + COUNT(*)::INT
    INTO v_refs, v_count
    FROM old_expired;

    RETURN QUERY SELECT v_count, v_refs;
END;
$$;

-- 4. Also expire corresponding transactions when payment expires
CREATE OR REPLACE FUNCTION sync_payment_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'failed' AND OLD.status = 'pending'
       AND (NEW.metadata->>'expiry_reason') IS NOT NULL THEN
        -- Mark matching transaction as FAILED too
        UPDATE public.transactions
        SET status = 'FAILED',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'expiry_reason', NEW.metadata->>'expiry_reason'
            ),
            updated_at = NOW()
        WHERE reference_id = NEW.reference
        AND status = 'PENDING';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_expiry ON public.payments;
CREATE TRIGGER trg_sync_payment_expiry
    AFTER UPDATE ON public.payments
    FOR EACH ROW
    WHEN (NEW.status = 'failed' AND OLD.status = 'pending')
    EXECUTE FUNCTION sync_payment_expiry();

-- 5. Admin view for payment overview
CREATE OR REPLACE VIEW public.v_payment_overview AS
SELECT
    p.id,
    p.user_id,
    pr.email AS user_email,
    pr.username,
    p.reference,
    p.provider,
    p.method,
    p.amount,
    p.currency,
    p.status,
    p.credited,
    p.sender_name,
    p.verification_source,
    p.created_at,
    p.expires_at,
    p.completed_at,
    p.metadata
FROM public.payments p
LEFT JOIN public.profiles pr ON pr.id = p.user_id
ORDER BY p.created_at DESC;

COMMIT;
