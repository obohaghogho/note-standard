-- Push Subscriptions table for Web Push Notifications
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, endpoint)
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own subscriptions"
    ON public.push_subscriptions
    FOR ALL
    USING (auth.uid() = user_id);

-- Profile field for notification preferences (Optional but good for native-like feel)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"push": true, "email": true, "mentions_only": false}'::jsonb;
