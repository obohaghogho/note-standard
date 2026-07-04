-- NoteStandard Financial Infrastructure (NFI) Database Schemas
BEGIN;

-- 1. Bank/Fintech Connectors Catalog
CREATE TABLE IF NOT EXISTS public.bank_connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- 'bank' | 'fintech' | 'crypto'
    status VARCHAR(20) DEFAULT 'active', -- 'active' | 'suspended' | 'maintenance'
    config JSONB DEFAULT '{}'::jsonb,
    is_sandbox BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Initial Connectors if they don't exist
INSERT INTO public.bank_connectors (name, provider_type, status, config, is_sandbox) VALUES
('paystack', 'fintech', 'active', '{"timeout_ms": 10000}', true),
('flutterwave', 'fintech', 'active', '{"timeout_ms": 10000}', true),
('stripe', 'fintech', 'active', '{"timeout_ms": 15000}', true),
('zenith', 'bank', 'active', '{"timeout_ms": 12000}', true),
('moniepoint', 'bank', 'active', '{"timeout_ms": 10000}', true),
('providus', 'bank', 'active', '{"timeout_ms": 10000}', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Connector Execution Logs (Auditable tracing of bank API interactions)
CREATE TABLE IF NOT EXISTS public.connector_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_name VARCHAR(50) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_payload JSONB DEFAULT '{}'::jsonb,
    response_payload JSONB DEFAULT '{}'::jsonb,
    status_code INTEGER,
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_logs_name ON public.connector_logs(connector_name);
CREATE INDEX IF NOT EXISTS idx_connector_logs_created ON public.connector_logs(created_at);

-- 3. Fraud Events Logs (Risk engine events)
CREATE TABLE IF NOT EXISTS public.fraud_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    transaction_ref VARCHAR(100),
    score INTEGER DEFAULT 0,
    reasons TEXT[],
    action VARCHAR(20) NOT NULL, -- 'allow' | 'review' | 'block'
    ip_address VARCHAR(45),
    device_fingerprint VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_events_user ON public.fraud_events(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_events_ref ON public.fraud_events(transaction_ref);

-- 4. Reconciliation Reports (Ledger matching and discrepancy audit)
CREATE TABLE IF NOT EXISTS public.reconciliation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    provider VARCHAR(50) NOT NULL,
    ledger_sum NUMERIC(20, 8) DEFAULT 0.0,
    provider_sum NUMERIC(20, 8) DEFAULT 0.0,
    discrepancy NUMERIC(20, 8) DEFAULT 0.0,
    status VARCHAR(20) DEFAULT 'balanced', -- 'balanced' | 'discrepancy' | 'resolved'
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_provider_date ON public.reconciliation_reports(provider, report_date);

-- 5. Merchant Accounts (Fintech payment acceptance integration API keys)
CREATE TABLE IF NOT EXISTS public.merchant_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    business_name VARCHAR(150) NOT NULL,
    public_key VARCHAR(100) UNIQUE NOT NULL,
    secret_key VARCHAR(100) UNIQUE NOT NULL,
    webhook_url VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'active' | 'suspended'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_user ON public.merchant_accounts(user_id);

-- 6. Fee Configurations
CREATE TABLE IF NOT EXISTS public.fee_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(50) NOT NULL, -- 'deposit' | 'withdrawal' | 'transfer'
    provider VARCHAR(50) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    percentage_fee NUMERIC(5, 2) DEFAULT 0.0,
    flat_fee NUMERIC(20, 8) DEFAULT 0.0,
    min_fee NUMERIC(20, 8) DEFAULT 0.0,
    max_fee NUMERIC(20, 8) DEFAULT 0.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_type_provider_currency ON public.fee_configurations(transaction_type, provider, currency);

-- Seed Initial NFI Fees
INSERT INTO public.fee_configurations (transaction_type, provider, currency, percentage_fee, flat_fee) VALUES
('withdrawal', 'paystack', 'NGN', 0.00, 100.00),
('withdrawal', 'stripe', 'USD', 1.00, 2.50),
('deposit', 'paystack', 'NGN', 1.50, 0.00),
('deposit', 'stripe', 'USD', 2.90, 0.30)
ON CONFLICT (transaction_type, provider, currency) DO NOTHING;

COMMIT;
