-- Native Push Tokens table for FCM and VoIP
CREATE TABLE IF NOT EXISTS public.native_device_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    token TEXT NOT NULL,
    platform TEXT CHECK (platform IN ('ios', 'android')) NOT NULL,
    type TEXT CHECK (type IN ('fcm', 'voip')) NOT NULL,
    device_id TEXT, -- To prevent duplicate tokens for same device
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, token)
);

-- Enable RLS
ALTER TABLE public.native_device_tokens ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own device tokens"
    ON public.native_device_tokens
    FOR ALL
    USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_native_tokens_user_id ON public.native_device_tokens(user_id);
