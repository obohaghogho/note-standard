-- System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    system_name TEXT DEFAULT 'Note Standard',
    maintenance_mode BOOLEAN DEFAULT false,
    registration_status TEXT DEFAULT 'public',
    admin_2fa_enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT one_row_only CHECK (id = '00000000-0000-0000-0000-000000000000'::uuid)
);

-- Insert default settings
INSERT INTO system_settings (id, system_name)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'Note Standard')
ON CONFLICT (id) DO NOTHING;

-- Admin Settings (Key-Value)
CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue Logs for Monetization Stats
CREATE TABLE IF NOT EXISTS revenue_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'USD',
    revenue_type TEXT, -- 'subscription', 'ad_payment', 'withdrawal_fee'
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affiliate Referrals for Affiliate Stats
CREATE TABLE IF NOT EXISTS affiliate_referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_user_id UUID REFERENCES auth.users(id),
    referred_user_id UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'pending', -- 'pending', 'active', 'rewarded'
    reward_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referrer_user_id, referred_user_id)
);
