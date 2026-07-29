-- ============================================================
-- Migration 271: Crypto Multi-Network & Capability Synchronization
-- Purpose: Authoritative platform network registry & discovered provider capabilities
-- ============================================================

BEGIN;

-- 1. Discovered Provider Capabilities (From NOWPayments API)
CREATE TABLE IF NOT EXISTS public.crypto_provider_capabilities (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider             VARCHAR(50) NOT NULL DEFAULT 'nowpayments',
    currency             VARCHAR(20) NOT NULL,
    network              VARCHAR(30) NOT NULL DEFAULT 'NATIVE',
    api_reachable        BOOLEAN NOT NULL DEFAULT true,
    deposit_supported    BOOLEAN NOT NULL DEFAULT true,
    withdraw_supported   BOOLEAN NOT NULL DEFAULT true,
    min_amount           NUMERIC(24, 8) DEFAULT 0,
    verification_status  VARCHAR(30) DEFAULT 'VERIFIED',
    last_verified_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crypto_prov_cap UNIQUE (provider, currency, network)
);

-- 2. Authoritative Platform Network Registry (NoteStandard Platform Config)
CREATE TABLE IF NOT EXISTS public.crypto_networks (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency             VARCHAR(20) NOT NULL,            -- BTC, ETH, USDT, USDC
    network              VARCHAR(30) NOT NULL,            -- BITCOIN, ETHEREUM, TRC20, ERC20, BEP20, POLYGON
    network_label        VARCHAR(50) NOT NULL,            -- Bitcoin, Ethereum, Tron (TRC20), etc.
    wallet_configured    BOOLEAN NOT NULL DEFAULT true,   -- Payout wallet configured in merchant dashboard
    deposits_enabled     BOOLEAN NOT NULL DEFAULT true,
    withdrawals_enabled  BOOLEAN NOT NULL DEFAULT true,
    operational_state    VARCHAR(30) NOT NULL DEFAULT 'READY', -- READY | DISABLED | MAINTENANCE | WALLET_MISSING | DEGRADED
    disabled_reason      TEXT,
    min_confirmations    INTEGER NOT NULL DEFAULT 12,
    explorer_url         TEXT,
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crypto_networks UNIQUE (currency, network)
);

-- Pre-seed Platform Network Registry based on Live NOWPayments Merchant Configuration
INSERT INTO public.crypto_networks (currency, network, network_label, wallet_configured, deposits_enabled, withdrawals_enabled, operational_state, disabled_reason, min_confirmations, explorer_url)
VALUES
    ('BTC',  'BITCOIN',  'Bitcoin (Native)',       true,  true,  true,  'READY',          NULL, 3,  'https://mempool.space/tx/'),
    ('ETH',  'ETHEREUM', 'Ethereum (ERC20)',       true,  true,  true,  'READY',          NULL, 12, 'https://etherscan.io/tx/'),
    ('USDT', 'TRC20',    'TRON (TRC20)',           true,  true,  true,  'READY',          NULL, 20, 'https://tronscan.org/#/transaction/'),
    ('USDT', 'ERC20',    'Ethereum (ERC20)',       false, false, false, 'WALLET_MISSING', 'Platform payout wallet not configured in merchant dashboard', 20, 'https://etherscan.io/tx/'),
    ('USDT', 'BEP20',    'BNB Chain (BEP20)',      false, false, false, 'DISABLED',       'Platform network disabled by administrator', 15, 'https://bscscan.com/tx/'),
    ('USDC', 'ERC20',    'Ethereum (ERC20)',       true,  true,  true,  'READY',          NULL, 20, 'https://etherscan.io/tx/'),
    ('USDC', 'POLYGON',  'Polygon (MATIC)',        false, false, false, 'DISABLED',       'Platform network disabled by administrator', 15, 'https://polygonscan.com/tx/')
ON CONFLICT (currency, network) DO UPDATE SET 
    wallet_configured = EXCLUDED.wallet_configured,
    deposits_enabled = EXCLUDED.deposits_enabled,
    withdrawals_enabled = EXCLUDED.withdrawals_enabled,
    operational_state = EXCLUDED.operational_state,
    disabled_reason = EXCLUDED.disabled_reason;

-- RLS & Service Role Access
ALTER TABLE public.crypto_provider_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_networks ENABLE ROW LEVEL SECURITY;

CREATE POLICY crypto_prov_cap_service ON public.crypto_provider_capabilities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY crypto_net_service ON public.crypto_networks FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
