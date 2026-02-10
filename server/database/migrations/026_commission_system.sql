-- ====================================
-- COMMISSION SYSTEM SCHEMA
-- ====================================

-- 1. PLATFORM WALLETS
-- Stores the destination wallets for collected commissions
CREATE TABLE platform_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency VARCHAR(10) NOT NULL, -- 'BTC', 'ETH', 'USD', 'NGN'
    chain VARCHAR(20), -- 'BITCOIN', 'ETHEREUM', 'TRC20', 'ERC20' or NULL for Fiat
    wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL, -- Link to internal wallet if it exists
    external_address TEXT, -- For withdrawing from platform
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_platform_currency_chain UNIQUE (currency, chain)
);

-- 2. COMMISSION SETTINGS
-- Configurable rules for fees
CREATE TABLE commission_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_type VARCHAR(20) NOT NULL, -- 'TRANSFER_OUT', 'WITHDRAWAL', 'SWAP', 'DEPOSIT'
    commission_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE', -- 'PERCENTAGE', 'FIXED'
    value NUMERIC(30, 18) NOT NULL, -- Percentage (e.g., 0.01 for 1%) or Fixed Amount
    min_fee NUMERIC(30, 18) DEFAULT 0,
    max_fee NUMERIC(30, 18), -- NULL = Uncapped
    currency VARCHAR(10), -- NULL = Applies to all, or specific currency
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_active_setting UNIQUE (transaction_type, currency)
);

-- 3. COMMISSIONS LOG
-- Audit trail for every fee collected
CREATE TABLE commissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    source_user_id UUID REFERENCES auth.users(id),
    amount NUMERIC(30, 18) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    rate_applied NUMERIC(30, 18), -- Snapshot of rate used
    commission_type VARCHAR(20), -- 'PERCENTAGE' or 'FIXED'
    platform_wallet_id UUID REFERENCES platform_wallets(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS POLICIES
ALTER TABLE platform_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- Only Admins/Service Role can manage these
-- For now, allow read for authenticated users to see fees
CREATE POLICY "Users can view commission settings" ON commission_settings
    FOR SELECT USING (auth.role() = 'authenticated');

-- Triggers for updated_at
CREATE TRIGGER update_platform_wallets_updated_at
    BEFORE UPDATE ON platform_wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commission_settings_updated_at
    BEFORE UPDATE ON commission_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
