-- 1. Device Installations Table (The Root Entity)
CREATE TABLE IF NOT EXISTS public.device_installations (
    installation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT NOT NULL,
    push_endpoint TEXT, -- Can be a Web Push endpoint URL or an FCM/APNs token
    push_p256dh TEXT,   -- For Web Push
    push_auth TEXT,     -- For Web Push
    platform TEXT,      -- 'ios', 'android', 'web'
    type TEXT,          -- 'fcm', 'apns', 'vapid'
    capabilities JSONB DEFAULT '{"supports_web_push": false, "supports_fcm": false, "supports_apns": false, "supports_background_sync": false}'::jsonb,
    token_updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    last_registration_source TEXT,
    last_push_success TIMESTAMP WITH TIME ZONE,
    last_push_failure TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(device_id),
    UNIQUE(push_endpoint)
);

-- Enable RLS
ALTER TABLE public.device_installations ENABLE ROW LEVEL SECURITY;



DROP POLICY IF EXISTS "Service Role can manage all device installations" ON public.device_installations;
CREATE POLICY "Service Role can manage all device installations"
    ON public.device_installations
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 2. Installation Accounts (The Junction Table with Lifecycles)
CREATE TABLE IF NOT EXISTS public.installation_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    installation_id UUID REFERENCES public.device_installations(installation_id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    session_state TEXT CHECK (session_state IN ('ACTIVE', 'BACKGROUND', 'LOGGED_OUT', 'REVOKED')) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(installation_id, user_id)
);

-- Enable RLS
ALTER TABLE public.installation_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own installation accounts" ON public.installation_accounts;
CREATE POLICY "Users can manage their own installation accounts"
    ON public.installation_accounts
    FOR ALL
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service Role can manage all installation accounts" ON public.installation_accounts;
CREATE POLICY "Service Role can manage all installation accounts"
    ON public.installation_accounts
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 3. Push Delivery Telemetry (Push Routing Decision Log)
CREATE TABLE IF NOT EXISTS public.push_delivery_telemetry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id TEXT NOT NULL,
    recipient_id UUID NOT NULL,
    resolved_installations JSONB, -- Array of objects: { id, state }
    socket_present BOOLEAN,
    push_sent BOOLEAN,
    reason TEXT, -- e.g., 'ACTIVE_SOCKET_PRESENT', 'BACKGROUND_ONLY'
    provider_result TEXT,
    delivery_ack_received BOOLEAN DEFAULT false,
    ack_latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_installations_device ON public.device_installations(device_id);

-- Allow users to manage devices they have an installation account for
DROP POLICY IF EXISTS "Users can view their device installations" ON public.device_installations;
CREATE POLICY "Users can view their device installations"
    ON public.device_installations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.installation_accounts ia 
            WHERE ia.installation_id = device_installations.installation_id 
            AND ia.user_id = auth.uid()
        )
    );
