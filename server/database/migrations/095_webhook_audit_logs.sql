-- Migration 095: Webhook Audit Logs
-- Records all incoming provider notifications for security forensics and debugging.

CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL,
    reference TEXT,
    payload JSONB NOT NULL,
    headers JSONB NOT NULL,
    ip_address TEXT,
    processed BOOLEAN DEFAULT FALSE,
    processing_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for faster lookups during debugging
CREATE INDEX IF NOT EXISTS idx_webhook_logs_reference ON public.webhook_logs(reference);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON public.webhook_logs(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at);

-- Grant permissions
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can see webhook logs
DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.webhook_logs;
CREATE POLICY "Admins can view webhook logs" 
ON public.webhook_logs 
FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- The service role can insert (for the backend logger)
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.webhook_logs;
CREATE POLICY "Service role can insert webhook logs" 
ON public.webhook_logs 
FOR INSERT 
TO service_role 
WITH CHECK (true);

COMMENT ON TABLE public.webhook_logs IS 'Audit trail for all incoming payment provider webhooks.';
