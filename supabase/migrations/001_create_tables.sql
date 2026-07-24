-- ============================================================================
-- NoteStandard Payment Platform — Database Migration 001
-- Creates all tables, indexes, RLS policies, and seed data
-- ============================================================================

-- 1. Supported Currencies (reference table)
CREATE TABLE supported_currencies (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('fiat', 'crypto')),
    minor_unit_name VARCHAR(20),
    minor_unit_factor BIGINT NOT NULL DEFAULT 100,
    symbol VARCHAR(10),
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO supported_currencies (code, name, type, minor_unit_name, minor_unit_factor, symbol, is_active) VALUES
    ('NGN', 'Nigerian Naira', 'fiat', 'kobo', 100, '₦', true),
    ('USD', 'US Dollar', 'fiat', 'cent', 100, '$', false),
    ('EUR', 'Euro', 'fiat', 'cent', 100, '€', false),
    ('GBP', 'British Pound', 'fiat', 'penny', 100, '£', false),
    ('BTC', 'Bitcoin', 'crypto', 'satoshi', 100000000, '₿', false),
    ('ETH', 'Ethereum', 'crypto', 'gwei', 1000000000, 'Ξ', false),
    ('USDT', 'Tether', 'crypto', 'micro', 1000000, '₮', false),
    ('USDC', 'USD Coin', 'crypto', 'micro', 1000000, 'USDC', false);

-- 2. Wallets
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    available_balance BIGINT NOT NULL DEFAULT 0,
    reserved_balance BIGINT NOT NULL DEFAULT 0,
    locked_balance BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, currency),
    CONSTRAINT positive_balance CHECK (balance >= 0),
    CONSTRAINT positive_available CHECK (available_balance >= 0),
    CONSTRAINT positive_reserved CHECK (reserved_balance >= 0),
    CONSTRAINT positive_locked CHECK (locked_balance >= 0),
    CONSTRAINT balance_consistency CHECK (balance = available_balance + reserved_balance + locked_balance)
);

CREATE INDEX idx_wallets_user ON wallets(user_id);

-- 3. Ledger Entries
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
    category VARCHAR(50) NOT NULL,
    description TEXT,
    reference VARCHAR(255) NOT NULL UNIQUE,
    provider VARCHAR(50),
    provider_reference VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_reference ON ledger_entries(reference);
CREATE INDEX idx_ledger_provider_ref ON ledger_entries(provider_reference);
CREATE INDEX idx_ledger_status ON ledger_entries(status);
CREATE INDEX idx_ledger_created ON ledger_entries(created_at);
CREATE INDEX idx_ledger_category ON ledger_entries(category);

-- 4. Wallet Reservations
CREATE TABLE wallet_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'card_authorization', 'escrow', 'marketplace_hold',
        'crypto_swap', 'p2p_transfer', 'withdrawal_hold'
    )),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'captured', 'released', 'expired')),
    reference VARCHAR(255) NOT NULL UNIQUE,
    related_entity_type VARCHAR(50),
    related_entity_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    captured_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservation_wallet ON wallet_reservations(wallet_id);
CREATE INDEX idx_reservation_status ON wallet_reservations(status);
CREATE INDEX idx_reservation_expires ON wallet_reservations(expires_at) WHERE status = 'active';

-- 5. Provider Transactions
CREATE TABLE provider_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    provider VARCHAR(50) NOT NULL,
    provider_reference VARCHAR(255),
    internal_reference VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN (
        'deposit', 'withdrawal', 'crypto_purchase', 'crypto_sale', 'refund'
    )),
    amount BIGINT NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'success', 'failed', 'abandoned', 'refunded')),
    channel VARCHAR(50),
    provider_fees BIGINT DEFAULT 0,
    provider_response JSONB DEFAULT '{}',
    paid_at TIMESTAMPTZ,
    ledger_entry_id UUID REFERENCES ledger_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ptx_user ON provider_transactions(user_id);
CREATE INDEX idx_ptx_ref ON provider_transactions(internal_reference);
CREATE INDEX idx_ptx_provider ON provider_transactions(provider, provider_reference);
CREATE INDEX idx_ptx_status ON provider_transactions(status);

-- 6. Withdrawal Requests
CREATE TABLE withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    fee BIGINT NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected')),
    destination_type VARCHAR(20) NOT NULL
        CHECK (destination_type IN ('bank', 'crypto', 'mobile_money')),
    destination_details JSONB NOT NULL,
    provider VARCHAR(50),
    provider_reference VARCHAR(255),
    reservation_id UUID REFERENCES wallet_reservations(id),
    rejection_reason TEXT,
    risk_score INTEGER,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    ledger_entry_id UUID REFERENCES ledger_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wr_user ON withdrawal_requests(user_id);
CREATE INDEX idx_wr_status ON withdrawal_requests(status);

-- 7. Audit Logs (immutable — NO updated_at)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES auth.users(id),
    actor_type VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (actor_type IN ('user', 'admin', 'system', 'webhook')),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    changes JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- 8. Risk Events
CREATE TABLE risk_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('allow', 'flag', 'block')),
    reason TEXT NOT NULL,
    related_reference VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_risk_user ON risk_events(user_id);
CREATE INDEX idx_risk_severity ON risk_events(severity);

-- 9. User Tiers
CREATE TABLE user_tiers (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO user_tiers (id, name, description, is_default) VALUES
    ('basic', 'Basic', 'Default tier for new users', true),
    ('premium', 'Premium', 'Verified users with higher limits', false),
    ('business', 'Business', 'Business accounts', false);

-- 10. Tier Limits
CREATE TABLE tier_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_id VARCHAR(30) NOT NULL REFERENCES user_tiers(id),
    currency VARCHAR(10) NOT NULL REFERENCES supported_currencies(code),
    limit_type VARCHAR(30) NOT NULL CHECK (limit_type IN (
        'daily_deposit', 'daily_withdrawal', 'single_deposit',
        'single_withdrawal', 'daily_transaction_count', 'monthly_volume'
    )),
    max_amount BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tier_id, currency, limit_type)
);

INSERT INTO tier_limits (tier_id, currency, limit_type, max_amount) VALUES
    ('basic', 'NGN', 'daily_deposit', 50000000),
    ('basic', 'NGN', 'daily_withdrawal', 20000000),
    ('basic', 'NGN', 'single_deposit', 20000000),
    ('basic', 'NGN', 'single_withdrawal', 10000000),
    ('basic', 'NGN', 'daily_transaction_count', 20),
    ('premium', 'NGN', 'daily_deposit', 500000000),
    ('premium', 'NGN', 'daily_withdrawal', 200000000),
    ('premium', 'NGN', 'single_deposit', 100000000),
    ('premium', 'NGN', 'single_withdrawal', 50000000),
    ('premium', 'NGN', 'daily_transaction_count', 100),
    ('business', 'NGN', 'daily_deposit', NULL),
    ('business', 'NGN', 'daily_withdrawal', NULL),
    ('business', 'NGN', 'single_deposit', NULL),
    ('business', 'NGN', 'single_withdrawal', NULL),
    ('business', 'NGN', 'daily_transaction_count', NULL);

-- 11. System Configuration
CREATE TABLE system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO system_config (key, value, description, category) VALUES
    ('deposit.min_amount_ngn', '10000', 'Minimum deposit in kobo (₦100)', 'deposits'),
    ('deposit.max_amount_ngn', '1000000000', 'Maximum deposit in kobo (₦10M)', 'deposits'),
    ('withdrawal.min_amount_ngn', '50000', 'Minimum withdrawal in kobo (₦500)', 'withdrawals'),
    ('withdrawal.auto_approve_threshold_ngn', '5000000', 'Auto-approve below ₦50,000', 'withdrawals'),
    ('withdrawal.fee_flat_ngn', '5000', 'Flat fee in kobo (₦50)', 'withdrawals'),
    ('risk.velocity_window_minutes', '30', 'Time window for velocity checks', 'risk'),
    ('risk.velocity_max_transactions', '5', 'Max transactions in velocity window', 'risk'),
    ('risk.new_account_restriction_hours', '24', 'Restriction period for new accounts', 'risk'),
    ('reservation.default_expiry_minutes', '30', 'Default reservation TTL', 'reservations'),
    ('exchange_rate.cache_ttl_seconds', '300', 'How long to cache exchange rates', 'exchange'),
    ('provider.webhook_retry_window_seconds', '86400', 'Ignore duplicate webhooks after this', 'providers'),
    ('provider.health_check_interval_seconds', '60', 'Health check frequency', 'providers'),
    ('provider.unhealthy_failure_threshold', '5', 'Failures before marking unhealthy', 'providers');

-- 12. Feature Flags
CREATE TABLE feature_flags (
    key VARCHAR(100) PRIMARY KEY,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    rollout_percentage INTEGER DEFAULT 100
        CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    allowed_tiers VARCHAR(30)[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO feature_flags (key, is_enabled, description) VALUES
    ('deposits', true, 'Enable deposit functionality'),
    ('withdrawals', true, 'Enable withdrawal functionality'),
    ('crypto_wallets', false, 'Enable cryptocurrency wallets'),
    ('p2p_transfers', false, 'Enable peer-to-peer transfers'),
    ('usd_wallet', false, 'Enable USD wallet creation'),
    ('eur_wallet', false, 'Enable EUR wallet creation'),
    ('btc_wallet', false, 'Enable BTC wallet'),
    ('exchange', false, 'Enable currency exchange'),
    ('dva', false, 'Enable Dedicated Virtual Accounts'),
    ('rewards', false, 'Enable transaction rewards');

-- 13. Exchange Rates
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency VARCHAR(10) NOT NULL,
    quote_currency VARCHAR(10) NOT NULL,
    rate NUMERIC(20, 8) NOT NULL,
    source VARCHAR(50) NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(base_currency, quote_currency, source)
);

CREATE INDEX idx_rates_pair ON exchange_rates(base_currency, quote_currency);
CREATE INDEX idx_rates_expires ON exchange_rates(expires_at);

-- 14. Provider Health
CREATE TABLE provider_health (
    provider_name VARCHAR(50) PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'healthy'
        CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms INTEGER,
    success_rate_24h NUMERIC(5, 2),
    last_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO provider_health (provider_name, status) VALUES
    ('paystack', 'healthy'),
    ('fincra', 'healthy'),
    ('nowpayments', 'healthy');

-- 15. Job Queue
CREATE TABLE job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    locked_by VARCHAR(100),
    locked_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_queue_pending ON job_queue(status, priority DESC, scheduled_for)
    WHERE status = 'pending';
CREATE INDEX idx_queue_locked ON job_queue(locked_at)
    WHERE status = 'processing';

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- User-facing: read own data
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_select ON wallets FOR SELECT USING (user_id = auth.uid());

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_select ON ledger_entries FOR SELECT
    USING (wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid()));

ALTER TABLE wallet_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservation_select ON wallet_reservations FOR SELECT
    USING (wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid()));

ALTER TABLE provider_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ptx_select ON provider_transactions FOR SELECT USING (user_id = auth.uid());

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY withdrawal_select ON withdrawal_requests FOR SELECT USING (user_id = auth.uid());

-- Admin/system only: no user policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
