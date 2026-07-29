-- ============================================================
-- Migration 270: Crypto Enterprise Architecture (NOWPayments Phase 18A)
-- Purpose: Schema support for multi-provider crypto inventory, 
--          confirmation engine, deposit address pooling, withdrawal queue,
--          hot/warm/cold balance tracking, and proof-of-reserves.
-- ============================================================

BEGIN;

-- 1. Crypto Wallet Inventory (Hot, Warm, Cold Storage)
CREATE TABLE IF NOT EXISTS public.crypto_wallet_inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency        VARCHAR(20) NOT NULL,            -- BTC, ETH, USDT, USDC
    network         VARCHAR(30) NOT NULL,            -- TRC20, ERC20, BEP20, POLYGON, BITCOIN, ETHEREUM
    wallet_type     VARCHAR(20) NOT NULL,            -- HOT, WARM, COLD
    provider        VARCHAR(50) NOT NULL DEFAULT 'nowpayments',
    address         TEXT NOT NULL,
    balance         NUMERIC(24, 8) NOT NULL DEFAULT 0,
    available       NUMERIC(24, 8) NOT NULL DEFAULT 0,
    reserved        NUMERIC(24, 8) NOT NULL DEFAULT 0,
    last_synced_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crypto_inventory UNIQUE (currency, network, wallet_type, provider, address)
);

-- 2. Blockchain Confirmation Tracking Engine
CREATE TABLE IF NOT EXISTS public.deposit_confirmations (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_hash       TEXT NOT NULL UNIQUE,
    user_id                UUID REFERENCES public.profiles(id),
    asset                  VARCHAR(20) NOT NULL,
    network                VARCHAR(30) NOT NULL,
    current_confirmations  INTEGER NOT NULL DEFAULT 0,
    required_confirmations INTEGER NOT NULL DEFAULT 12,
    amount                 NUMERIC(24, 8) NOT NULL DEFAULT 0,
    status                 VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | CONFIRMED | FINALIZED | REJECTED
    deposit_address        TEXT,
    metadata               JSONB DEFAULT '{}'::jsonb,
    created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    confirmed_at           TIMESTAMP WITH TIME ZONE
);

-- 3. Crypto Withdrawal Queue
CREATE TABLE IF NOT EXISTS public.crypto_withdrawal_queue (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES public.profiles(id),
    recipient_address  TEXT NOT NULL,
    asset              VARCHAR(20) NOT NULL,
    network            VARCHAR(30) NOT NULL DEFAULT 'NATIVE',
    amount             NUMERIC(24, 8) NOT NULL,
    priority           VARCHAR(20) NOT NULL DEFAULT 'NORMAL', -- HIGH | NORMAL | LOW
    risk_score         NUMERIC(5, 2) DEFAULT 0,
    provider           VARCHAR(50) NOT NULL DEFAULT 'nowpayments',
    status             VARCHAR(20) NOT NULL DEFAULT 'APPROVED', -- APPROVED | PROCESSING | SENT | FAILED | RETRY
    transaction_hash   TEXT,
    error_message      TEXT,
    correlation_id     TEXT,
    metadata           JSONB DEFAULT '{}'::jsonb,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Confirmation Thresholds Rules
CREATE TABLE IF NOT EXISTS public.confirmation_thresholds (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset              VARCHAR(20) NOT NULL,
    network            VARCHAR(30) NOT NULL,
    min_confirmations  INTEGER NOT NULL DEFAULT 12,
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_confirm_threshold UNIQUE (asset, network)
);

-- Pre-seed confirmation thresholds
INSERT INTO public.confirmation_thresholds (asset, network, min_confirmations)
VALUES 
    ('BTC', 'BITCOIN', 3),
    ('ETH', 'ETHEREUM', 12),
    ('USDT', 'TRC20', 20),
    ('USDT', 'ERC20', 20),
    ('USDT', 'BEP20', 15),
    ('USDC', 'ERC20', 20),
    ('USDC', 'POLYGON', 15)
ON CONFLICT (asset, network) DO UPDATE SET min_confirmations = EXCLUDED.min_confirmations;

-- 5. Intelligent Deposit Address Pool Expansion
ALTER TABLE public.nowpayments_deposit_addresses ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0;
ALTER TABLE public.nowpayments_deposit_addresses ADD COLUMN IF NOT EXISTS last_user UUID;
ALTER TABLE public.nowpayments_deposit_addresses ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.nowpayments_deposit_addresses ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5, 2) DEFAULT 0;

-- 6. Hot Wallet Minimum & Target Thresholds
CREATE TABLE IF NOT EXISTS public.hot_wallet_thresholds (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset            VARCHAR(20) NOT NULL,
    network          VARCHAR(30) NOT NULL DEFAULT 'NATIVE',
    min_balance      NUMERIC(24, 8) NOT NULL DEFAULT 0,
    target_balance   NUMERIC(24, 8) NOT NULL DEFAULT 0,
    rebalance_action TEXT,
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hot_wallet_thresh UNIQUE (asset, network)
);

-- Pre-seed hot wallet thresholds
INSERT INTO public.hot_wallet_thresholds (asset, network, min_balance, target_balance, rebalance_action)
VALUES 
    ('USDT', 'TRC20', 25000.0, 50000.0, 'Move from Cold Wallet'),
    ('USDT', 'ERC20', 25000.0, 50000.0, 'Move from Cold Wallet'),
    ('USDC', 'ERC20', 25000.0, 50000.0, 'Move from Cold Wallet'),
    ('BTC', 'BITCOIN', 1.0, 3.0, 'Top up BTC Hot Reserve'),
    ('ETH', 'ETHEREUM', 10.0, 25.0, 'Top up ETH Hot Reserve')
ON CONFLICT (asset, network) DO UPDATE SET min_balance = EXCLUDED.min_balance, target_balance = EXCLUDED.target_balance;

-- 7. Crypto Reconciliation Reports
CREATE TABLE IF NOT EXISTS public.crypto_reconciliation_reports (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    discrepancies_found INTEGER NOT NULL DEFAULT 0,
    flagged_count      INTEGER NOT NULL DEFAULT 0,
    details            JSONB DEFAULT '{}'::jsonb,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexing for high-throughput query engine
CREATE INDEX IF NOT EXISTS idx_crypto_inv_cur_net ON public.crypto_wallet_inventory(currency, network);
CREATE INDEX IF NOT EXISTS idx_deposit_conf_hash ON public.deposit_confirmations(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_deposit_conf_status ON public.deposit_confirmations(status);
CREATE INDEX IF NOT EXISTS idx_crypto_withdraw_status ON public.crypto_withdrawal_queue(status);
CREATE INDEX IF NOT EXISTS idx_crypto_withdraw_user ON public.crypto_withdrawal_queue(user_id);

-- RLS Policies
ALTER TABLE public.crypto_wallet_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_withdrawal_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY crypto_inv_service ON public.crypto_wallet_inventory FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY deposit_conf_service ON public.deposit_confirmations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY crypto_withdraw_service ON public.crypto_withdrawal_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
