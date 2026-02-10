-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, subscription)
);

-- RLS Policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own subscriptions" 
    ON push_subscriptions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own subscriptions" 
    ON push_subscriptions FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions" 
    ON push_subscriptions FOR DELETE 
    USING (auth.uid() = user_id);
