-- 351_enterprise_collection_architecture_v4.sql
-- NoteStandard Enterprise Banking Platform (Architecture v4.0 Final Blueprint)
-- Provider-neutral Multi-Currency Collection Accounts, Canonical Provider Transactions,
-- Deposit References with FSM, Unallocated Deposits Queue, and Correlated Dual-Journal Tracking.

-- Drop draft tables if partially created without new columns
DROP TABLE IF EXISTS public.provider_transactions CASCADE;
DROP TABLE IF EXISTS public.collection_accounts CASCADE;
DROP TABLE IF EXISTS public.deposit_references CASCADE;
DROP TABLE IF EXISTS public.unallocated_deposits CASCADE;

-- 1. Provider Transactions (Canonical Webhook & Provider Ingestion Log)
CREATE TABLE IF NOT EXISTS public.provider_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL DEFAULT 'fincra',
  provider_tx_id VARCHAR(150) UNIQUE,
  provider_reference VARCHAR(150),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  rail VARCHAR(50) NOT NULL DEFAULT 'LOCAL',
  amount NUMERIC(20,8) NOT NULL DEFAULT 0,
  sender_name VARCHAR(150),
  sender_account VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'MATCHED', 'UNALLOCATED', 'REJECTED', 'REVERSED')),
  settlement_status VARCHAR(30) NOT NULL DEFAULT 'UNSETTLED' CHECK (settlement_status IN ('UNSETTLED', 'PENDING_SETTLEMENT', 'SETTLED')),
  raw_payload JSONB DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Collection Accounts (Provider-neutral Operational Banking Accounts)
CREATE TABLE IF NOT EXISTS public.collection_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL DEFAULT 'fincra',
  account_type VARCHAR(30) NOT NULL DEFAULT 'MERCHANT_COLLECTION' CHECK (account_type IN ('MERCHANT_COLLECTION', 'CUSTOMER_VIRTUAL')),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  country VARCHAR(10) NOT NULL DEFAULT 'US',
  rail VARCHAR(50) NOT NULL DEFAULT 'LOCAL',
  bank_name VARCHAR(100) NOT NULL DEFAULT 'Settlement Bank',
  iban VARCHAR(100),
  account_number VARCHAR(50),
  sort_code VARCHAR(30),
  swift VARCHAR(30),
  beneficiary VARCHAR(150) NOT NULL DEFAULT 'Jossy Digital Technologies Ltd',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  health VARCHAR(20) NOT NULL DEFAULT 'HEALTHY' CHECK (health IN ('HEALTHY', 'DEGRADED', 'DOWN')),
  daily_limit NUMERIC(20,8) DEFAULT 1000000,
  monthly_limit NUMERIC(20,8) DEFAULT 25000000,
  current_utilization NUMERIC(20,8) DEFAULT 0,
  capabilities JSONB DEFAULT '["DEPOSIT", "COLLECTION"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Deposit References (Unique Immutable Reference Registry linked 1-to-N to Payment Intents)
CREATE TABLE IF NOT EXISTS public.deposit_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(50) UNIQUE NOT NULL,
  idempotency_key UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL,
  currency VARCHAR(10) NOT NULL,
  rail VARCHAR(50) NOT NULL DEFAULT 'LOCAL',
  payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  expected_amount NUMERIC(20,8) DEFAULT 0,
  amount_validation_mode VARCHAR(30) NOT NULL DEFAULT 'OPEN_AMOUNT' CHECK (amount_validation_mode IN ('EXACT', 'ALLOW_OVERPAYMENT', 'ALLOW_PARTIAL', 'OPEN_AMOUNT')),
  status VARCHAR(30) NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'AWAITING_PAYMENT', 'MATCHED', 'PENDING_SETTLEMENT', 'SETTLED', 'POSTED', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Unallocated Deposits Queue (Reconciliation & Manual Assignment Queue)
CREATE TABLE IF NOT EXISTS public.unallocated_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL DEFAULT 'fincra',
  provider_version VARCHAR(20) DEFAULT 'v1.0',
  event_version VARCHAR(20) DEFAULT 'v1.0',
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  rail VARCHAR(50) NOT NULL DEFAULT 'LOCAL',
  amount NUMERIC(20,8) NOT NULL DEFAULT 0,
  sender_name VARCHAR(150),
  sender_account VARCHAR(100),
  bank_reference VARCHAR(150),
  provider_tx_id VARCHAR(150),
  raw_payload JSONB DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'UNALLOCATED' CHECK (status IN ('RECEIVED', 'MATCHED', 'PENDING_SETTLEMENT', 'SETTLED', 'POSTED', 'COMPLETED', 'UNALLOCATED', 'REJECTED', 'REVERSED', 'REFUNDED')),
  reason VARCHAR(255) DEFAULT 'REFERENCE_NOT_FOUND',
  match_confidence_score INT DEFAULT 0,
  match_reasons JSONB DEFAULT '[]'::jsonb,
  risk_score NUMERIC(5,2) DEFAULT 0,
  risk_flagged BOOLEAN DEFAULT FALSE,
  assigned_user_id UUID,
  assigned_wallet_id UUID,
  assigned_at TIMESTAMPTZ,
  correlation_id UUID,
  treasury_journal_id UUID,
  customer_journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_collection_acc_provider_curr ON public.collection_accounts(provider, currency, rail);
CREATE INDEX IF NOT EXISTS idx_deposit_ref_code ON public.deposit_references(reference);
CREATE INDEX IF NOT EXISTS idx_deposit_ref_user ON public.deposit_references(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_ref_intent ON public.deposit_references(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_provider_tx_provider_ref ON public.provider_transactions(provider, provider_tx_id);
CREATE INDEX IF NOT EXISTS idx_unallocated_status ON public.unallocated_deposits(status);

-- Seed Initial Fincra Merchant Collection Accounts for Jossy Digital Technologies Ltd
INSERT INTO public.collection_accounts 
  (provider, account_type, currency, country, rail, bank_name, iban, account_number, sort_code, swift, beneficiary, status, health)
VALUES
  ('fincra', 'MERCHANT_COLLECTION', 'EUR', 'LU', 'SEPA', 'Banking Circle S.A.', 'LU083928172635441092', NULL, NULL, 'BCIRLULL', 'Jossy Digital Technologies Ltd', 'ACTIVE', 'HEALTHY'),
  ('fincra', 'MERCHANT_COLLECTION', 'GBP', 'GB', 'FASTER_PAYMENTS', 'ClearBank Ltd', NULL, '88392019', '04-00-04', 'CLRBGB22', 'Jossy Digital Technologies Ltd', 'ACTIVE', 'HEALTHY'),
  ('fincra', 'MERCHANT_COLLECTION', 'USD', 'US', 'ACH', 'Choice Financial Group', NULL, '9928172635', '121000358', 'CHUSUS33', 'Jossy Digital Technologies Ltd', 'ACTIVE', 'HEALTHY'),
  ('fincra', 'MERCHANT_COLLECTION', 'NGN', 'NG', 'LOCAL', 'Wema Bank PLC', NULL, '9901827364', '035', 'WEMA NGLA', 'Jossy Digital Technologies Ltd', 'ACTIVE', 'HEALTHY')
ON CONFLICT DO NOTHING;
