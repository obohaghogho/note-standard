-- ============================================================
-- Migration 275: Production Crypto Ledger & Settlement Architecture
-- Purpose: Complete enterprise financial subsystem with double-entry
--          general ledger, chart of accounts, settlement provider registry,
--          provider capabilities, multi-network addresses, risk policies,
--          and multi-level reconciliation.
-- ============================================================

BEGIN;

-- 1. Master Settlement Providers Registry Table
CREATE TABLE IF NOT EXISTS public.settlement_providers (
    id VARCHAR(50) PRIMARY KEY, -- NOWPAYMENTS, FINCRA, ANCHOR, FIREBLOCKS, CIRCLE
    name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(30) NOT NULL DEFAULT 'CUSTODY', -- CUSTODY, FIAT_SETTLEMENT, DIRECT_NODE
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    capabilities JSONB NOT NULL DEFAULT '{
        "supports_deposits": true,
        "supports_withdrawals": true,
        "supports_custody": true,
        "supports_fiat": false,
        "supports_swap": false,
        "supports_internal_transfer": false
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Pre-seed core settlement providers
INSERT INTO public.settlement_providers (id, name, provider_type, status, capabilities)
VALUES 
    ('NOWPAYMENTS', 'NOWPayments Crypto Custody', 'CUSTODY', 'ACTIVE', '{
        "supports_deposits": true,
        "supports_withdrawals": true,
        "supports_custody": true,
        "supports_fiat": false,
        "supports_swap": true,
        "supports_internal_transfer": false
    }'::jsonb),
    ('FINCRA', 'Fincra Settlement Gateway', 'FIAT_SETTLEMENT', 'ACTIVE', '{
        "supports_deposits": true,
        "supports_withdrawals": true,
        "supports_custody": true,
        "supports_fiat": true,
        "supports_swap": false,
        "supports_internal_transfer": false
    }'::jsonb),
    ('ANCHOR', 'Anchor BaaS Settlement', 'FIAT_SETTLEMENT', 'ACTIVE', '{
        "supports_deposits": true,
        "supports_withdrawals": true,
        "supports_custody": true,
        "supports_fiat": true,
        "supports_swap": false,
        "supports_internal_transfer": false
    }'::jsonb),
    ('FIREBLOCKS', 'Fireblocks Vaults', 'CUSTODY', 'INACTIVE', '{
        "supports_deposits": true,
        "supports_withdrawals": true,
        "supports_custody": true,
        "supports_fiat": false,
        "supports_swap": false,
        "supports_internal_transfer": true
    }'::jsonb),
    ('CIRCLE', 'Circle Programmable Wallets', 'CUSTODY', 'INACTIVE', '{
        "supports_deposits": true,
        "supports_withdrawals": true,
        "supports_custody": true,
        "supports_fiat": true,
        "supports_swap": false,
        "supports_internal_transfer": true
    }'::jsonb)
ON CONFLICT (id) DO UPDATE SET 
    capabilities = EXCLUDED.capabilities,
    updated_at = NOW();

-- 2. Chart of Accounts Table (Double-Entry Foundation)
CREATE TABLE IF NOT EXISTS public.crypto_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(50) NOT NULL UNIQUE,
    account_name VARCHAR(100) NOT NULL,
    account_category VARCHAR(30) NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    currency VARCHAR(20) NOT NULL,
    provider_id VARCHAR(50) REFERENCES public.settlement_providers(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Pre-seed Standard Chart of Accounts
INSERT INTO public.crypto_accounts (account_code, account_name, account_category, currency, provider_id)
VALUES
    ('1000-NOWPAYMENTS-USDT', 'NOWPayments USDT Custody Account', 'ASSET', 'USDT', 'NOWPAYMENTS'),
    ('1001-NOWPAYMENTS-BTC',  'NOWPayments BTC Custody Account',  'ASSET', 'BTC',  'NOWPAYMENTS'),
    ('1002-NOWPAYMENTS-ETH',  'NOWPayments ETH Custody Account',  'ASSET', 'ETH',  'NOWPAYMENTS'),
    ('1003-NOWPAYMENTS-USDC', 'NOWPayments USDC Custody Account', 'ASSET', 'USDC', 'NOWPAYMENTS'),
    ('1010-FINCRA-USD',       'Fincra USD Settlement Account',    'ASSET', 'USD',  'FINCRA'),
    ('1020-ANCHOR-USD',       'Anchor USD Settlement Account',    'ASSET', 'USD',  'ANCHOR'),
    ('2000-USER-LIABILITIES', 'Customer Wallet Liabilities',      'LIABILITY', 'ALL', NULL),
    ('2001-PENDING-WITHDRAW', 'Pending User Withdrawals',          'LIABILITY', 'ALL', NULL),
    ('4000-PLATFORM-FEES',    'Platform Transaction Fee Revenue', 'REVENUE',   'ALL', NULL),
    ('5000-NETWORK-GAS-EXP',  'Blockchain Network Fee Expense',   'EXPENSE',   'ALL', NULL)
ON CONFLICT (account_code) DO NOTHING;

-- 3. Internal User Crypto Wallets
CREATE TABLE IF NOT EXISTS public.crypto_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    currency VARCHAR(20) NOT NULL,
    available_balance NUMERIC(24, 8) NOT NULL DEFAULT 0,
    locked_balance NUMERIC(24, 8) NOT NULL DEFAULT 0,
    pending_balance NUMERIC(24, 8) NOT NULL DEFAULT 0,
    total_balance NUMERIC(24, 8) GENERATED ALWAYS AS (available_balance + locked_balance + pending_balance) STORED,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, FROZEN, REVIEW, SUSPENDED, CLOSED
    version INT NOT NULL DEFAULT 1, -- Optimistic concurrency control
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crypto_wallets_user_currency UNIQUE (user_id, currency),
    CONSTRAINT chk_crypto_wallets_non_neg_avail CHECK (available_balance >= 0),
    CONSTRAINT chk_crypto_wallets_non_neg_locked CHECK (locked_balance >= 0),
    CONSTRAINT chk_crypto_wallets_non_neg_pending CHECK (pending_balance >= 0)
);

-- 4. Multi-Network Deposit Addresses per User
CREATE TABLE IF NOT EXISTS public.crypto_wallet_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider_id VARCHAR(50) NOT NULL REFERENCES public.settlement_providers(id),
    currency VARCHAR(20) NOT NULL,
    network VARCHAR(30) NOT NULL,
    address TEXT NOT NULL,
    tag_or_memo TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crypto_addresses_user_net UNIQUE (user_id, currency, network, address)
);

-- 5. Crypto Transactions Log
CREATE TABLE IF NOT EXISTS public.crypto_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.crypto_wallets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(255) UNIQUE,
    type VARCHAR(30) NOT NULL, -- deposit, withdrawal, transfer, swap, fee
    currency VARCHAR(20) NOT NULL,
    amount NUMERIC(24, 8) NOT NULL,
    fee NUMERIC(24, 8) NOT NULL DEFAULT 0,
    network VARCHAR(30),
    tx_hash VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, CONFIRMING, PROCESSING, PENDING_APPROVAL, COMPLETED, FAILED, CANCELLED
    approval_status VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED', -- NOT_REQUIRED, PENDING_APPROVAL, APPROVED, REJECTED
    required_approvals INT NOT NULL DEFAULT 0,
    approvals_count INT NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 6. Crypto General Ledger Entries (Double-Entry Bookkeeping)
CREATE TABLE IF NOT EXISTS public.crypto_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.crypto_transactions(id) ON DELETE CASCADE,
    debit_account_id UUID NOT NULL REFERENCES public.crypto_accounts(id),
    credit_account_id UUID NOT NULL REFERENCES public.crypto_accounts(id),
    currency VARCHAR(20) NOT NULL,
    amount NUMERIC(24, 8) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 7. Configurable Risk Policies Table
CREATE TABLE IF NOT EXISTS public.crypto_risk_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency VARCHAR(20) NOT NULL,
    tier VARCHAR(30) NOT NULL DEFAULT 'DEFAULT',
    min_amount NUMERIC(24, 8) NOT NULL DEFAULT 0,
    max_amount NUMERIC(24, 8) NOT NULL DEFAULT 1000,
    required_approvals INT NOT NULL DEFAULT 0,
    requires_2fa BOOLEAN NOT NULL DEFAULT true,
    requires_manual_review BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crypto_risk_policy_cur_tier UNIQUE (currency, tier, min_amount, max_amount)
);

-- Seed default risk policies
INSERT INTO public.crypto_risk_policies (currency, tier, min_amount, max_amount, required_approvals, requires_2fa, requires_manual_review)
VALUES
    ('ALL', 'AUTO_LOW',     0,       1000,    0, true,  false),
    ('ALL', 'SINGLE_ADMIN', 1000.01, 10000,   1, true,  true),
    ('ALL', 'DUAL_ADMIN',   10000.01,1000000, 2, true,  true)
ON CONFLICT DO NOTHING;

-- 8. Immutable Accounting Periods
CREATE TABLE IF NOT EXISTS public.accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_code VARCHAR(20) NOT NULL UNIQUE, -- e.g. '2026-07'
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, LOCKED, ARCHIVED
    closed_by UUID REFERENCES public.profiles(id),
    closed_at TIMESTAMP WITH TIME ZONE
);

-- 9. Custody Provider Balances
CREATE TABLE IF NOT EXISTS public.custody_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id VARCHAR(50) NOT NULL REFERENCES public.settlement_providers(id),
    currency VARCHAR(20) NOT NULL,
    available NUMERIC(24, 8) NOT NULL DEFAULT 0,
    locked NUMERIC(24, 8) NOT NULL DEFAULT 0,
    pending NUMERIC(24, 8) NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_custody_balances_provider_currency UNIQUE (provider_id, currency)
);

-- 10. Custody Sync Logs
CREATE TABLE IF NOT EXISTS public.custody_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id VARCHAR(50) NOT NULL REFERENCES public.settlement_providers(id),
    response_data JSONB DEFAULT '{}'::jsonb,
    errors JSONB DEFAULT NULL,
    duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 11. Multi-Signature Payout Approvals
CREATE TABLE IF NOT EXISTS public.crypto_payout_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.crypto_transactions(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES public.profiles(id),
    action VARCHAR(20) NOT NULL, -- APPROVED, REJECTED
    reason TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 12. Multi-Level Reconciliation Reports
CREATE TABLE IF NOT EXISTS public.crypto_reconciliation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    user_liabilities_total JSONB NOT NULL DEFAULT '{}'::jsonb,
    custody_assets_total JSONB NOT NULL DEFAULT '{}'::jsonb,
    blockchain_confirmations_total JSONB NOT NULL DEFAULT '{}'::jsonb,
    pending_transactions_total JSONB NOT NULL DEFAULT '{}'::jsonb,
    discrepancies_found INTEGER NOT NULL DEFAULT 0,
    details JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'BALANCED', -- BALANCED, DISCREPANCY_DETECTED, RESOLVED
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 13. Immutable Security Audit Logs
CREATE TABLE IF NOT EXISTS public.crypto_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_crypto_wallets_user ON public.crypto_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_tx_user ON public.crypto_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_tx_idempotency ON public.crypto_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_crypto_ledger_entries_tx ON public.crypto_ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_crypto_ledger_entries_debit ON public.crypto_ledger_entries(debit_account_id);
CREATE INDEX IF NOT EXISTS idx_crypto_ledger_entries_credit ON public.crypto_ledger_entries(credit_account_id);

COMMIT;
