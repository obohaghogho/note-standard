-- Migration 100: Hardening Grey Manual Payments
-- Purpose: Add transaction tracking, audit logs, and unmatched payment queue.

BEGIN;

-- 1. Unmatched Payments Queue
CREATE TABLE IF NOT EXISTS public.unmatched_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    amount NUMERIC(30,18),
    currency TEXT,
    sender TEXT,
    raw_text TEXT, -- The email body for manual review
    metadata JSONB DEFAULT '{}'::jsonb,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES auth.users(id),
    resolution_type TEXT CHECK (resolution_type IN ('linked', 'refunded', 'ignored')),
    resolution_reference TEXT, -- Our tx_ref if linked
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 2. Payment Audit Logs (For manual overrides/confirmations)
CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES auth.users(id) NOT NULL,
    payment_reference TEXT NOT NULL,
    action TEXT NOT NULL, -- e.g. 'MANUAL_CONFIRM', 'LINK_UNMATCHED'
    previous_status TEXT,
    new_status TEXT,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enhance Webhook Logs for Idempotency
-- We add a column to store the provider's unique ID for each transaction.
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS unique_transaction_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_logs_unique_tx ON public.webhook_logs(provider, unique_transaction_id) 
WHERE unique_transaction_id IS NOT NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_unmatched_payments_unresolved ON public.unmatched_payments(is_resolved) WHERE (NOT is_resolved);
CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_ref ON public.payment_audit_logs(payment_reference);

-- Permissions for Admins
DROP POLICY IF EXISTS "Admins can manage unmatched payments" ON public.unmatched_payments;
CREATE POLICY "Admins can manage unmatched payments" 
ON public.unmatched_payments 
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.payment_audit_logs;
CREATE POLICY "Admins can view audit logs" 
ON public.payment_audit_logs 
FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- RPC for automatic cleanup
CREATE OR REPLACE FUNCTION expire_pending_payments(p_expiry_hours INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.payments
    SET status = 'failed',
        metadata = jsonb_set(metadata, '{expiry_reason}', '"Auto-expired after 72h"')
    WHERE status = 'pending'
    AND created_at < NOW() - (p_expiry_hours * INTERVAL '1 hour');

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMIT;
