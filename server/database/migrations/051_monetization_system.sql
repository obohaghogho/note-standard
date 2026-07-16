-- Migration: 051_monetization_system.sql
-- Description: Comprehensive monetization system including spread, fees, subscriptions, and affiliates.

-- 1. Admin Settings Table
CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Initial Admin Settings
INSERT INTO admin_settings (key, value) VALUES
('spread_percentage', '1.0'),
('funding_fee_percentage', '1.0'),
('withdrawal_fee_flat', '0.0'),
('withdrawal_fee_percentage', '1.0'),
('subscription_pricing', '{"FREE": 0, "PRO": 9.99, "BUSINESS": 49.99}'),
('affiliate_percentage', '10.0'), -- 10% of our spread revenue
('daily_limits', '{"FREE": 1000, "PRO": 10000, "BUSINESS": 50000}')
ON CONFLICT (key) DO NOTHING;

-- 2. Enhanced Subscriptions Table
-- We already have a subscriptions table, let's update it to match requirements
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'FREE', -- requested field name
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;

-- Sync plan_tier to plan_type if they differ
UPDATE subscriptions SET plan_type = UPPER(plan_tier) WHERE plan_type = 'FREE' AND plan_tier IS NOT NULL;

-- 3. Affiliate Referrals Table
CREATE TABLE IF NOT EXISTS affiliate_referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    commission_percentage NUMERIC DEFAULT 10.0,
    total_commission_earned NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(referred_user_id) -- One person can only be referred by one other person
);

-- 4. Revenue Logs Table
CREATE TABLE IF NOT EXISTS revenue_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_transaction_id UUID, -- Optional link to original tx
    user_id UUID REFERENCES auth.users(id), -- User who generated revenue
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    revenue_type TEXT NOT NULL, -- 'spread', 'funding_fee', 'withdrawal_fee', 'subscription'
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Update Transactions Table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS spread_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS market_price NUMERIC,
ADD COLUMN IF NOT EXISTS final_price NUMERIC,
ADD COLUMN IF NOT EXISTS transaction_fee_breakdown JSONB DEFAULT '{}'::jsonb;

-- 6. Update Profiles Table for Compliance
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS user_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_ip TEXT,
ADD COLUMN IF NOT EXISTS last_device TEXT;

-- 7. Add RLS for new tables
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_logs ENABLE ROW LEVEL SECURITY;

-- Admin Settings: Viewable by everyone (or just system/admins? Usually frontend needs some settings)
CREATE POLICY "Admin settings viewable by everyone" ON admin_settings FOR SELECT USING (true);
CREATE POLICY "Admin settings editable by admins" ON admin_settings FOR ALL 
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Affiliate Referrals: Users see their own referrals
CREATE POLICY "Users can view own referrals" ON affiliate_referrals FOR SELECT 
USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

-- Revenue Logs: Only admins can see
CREATE POLICY "Admins can view revenue logs" ON revenue_logs FOR SELECT 
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 8. Add function for affiliate commission
CREATE OR REPLACE FUNCTION add_affiliate_commission(
    p_referred_user_id UUID,
    p_revenue_amount NUMERIC,
    p_currency TEXT,
    p_source_tx_id UUID
) RETURNS VOID AS $$
DECLARE
    v_referrer_id UUID;
    v_commission_percentage NUMERIC;
    v_commission_amount NUMERIC;
    v_referrer_wallet_id UUID;
BEGIN
    -- Get referrer
    SELECT referrer_user_id, commission_percentage INTO v_referrer_id, v_commission_percentage
    FROM affiliate_referrals WHERE referred_user_id = p_referred_user_id;

    IF v_referrer_id IS NOT NULL THEN
        v_commission_amount := (p_revenue_amount * v_commission_percentage) / 100.0;

        IF v_commission_amount > 0 THEN
            -- Update affiliate_referrals total
            UPDATE affiliate_referrals 
            SET total_commission_earned = total_commission_earned + v_commission_amount
            WHERE referred_user_id = p_referred_user_id;

            -- Find referrer's wallet for that currency
            SELECT id INTO v_referrer_wallet_id FROM wallets WHERE user_id = v_referrer_id AND currency = p_currency LIMIT 1;

            IF v_referrer_wallet_id IS NOT NULL THEN
                -- Credit referrer wallet
                UPDATE wallets 
                SET balance = balance + v_commission_amount,
                    available_balance = available_balance + v_commission_amount
                WHERE id = v_referrer_wallet_id;

                -- Log commission payout (optional transaction entry or revenue log?)
                -- We'll log it as a transaction for the referrer
                INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, metadata)
                VALUES (v_referrer_wallet_id, 'AFFILIATE_COMMISSION', v_commission_amount, p_currency, 'COMPLETED', p_source_tx_id::text, 
                        jsonb_build_object('referred_user_id', p_referred_user_id));
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
