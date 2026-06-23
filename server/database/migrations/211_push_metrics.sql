CREATE TABLE IF NOT EXISTS public.push_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    platform TEXT NOT NULL,
    push_type TEXT NOT NULL,
    status TEXT NOT NULL,
    error_code TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_metrics_created_at ON public.push_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_push_metrics_status ON public.push_metrics(status);
CREATE INDEX IF NOT EXISTS idx_push_metrics_platform ON public.push_metrics(platform);
