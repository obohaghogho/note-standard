-- Migration: 404_masterclass_enterprise_banking.sql
-- Description: Creates Enterprise NGN Banking, Provider-Independent Deposit Sessions,
-- Immutable Event Stream, Database-Driven Capabilities, Audit Trail & Command Controls.

-- 1. Table for User Bank Accounts (Shared Mode A vs Individual Mode B)
CREATE TABLE IF NOT EXISTS user_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  bank_code VARCHAR(50) NOT NULL,
  channel_reference VARCHAR(255),
  account_type VARCHAR(50) DEFAULT 'Virtual Account',
  allocation_type VARCHAR(50) NOT NULL DEFAULT 'shared',
  user_reference VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider, currency)
);

CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user_ref ON user_bank_accounts(user_reference);
CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_provider_curr ON user_bank_accounts(provider, currency);

-- 2. Provider-Independent Deposit Sessions Table
CREATE TABLE IF NOT EXISTS deposit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  currency VARCHAR(10) NOT NULL,
  expected_amount NUMERIC(18,4),
  user_reference VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'CREATED',
  expires_at TIMESTAMPTZ NOT NULL,
  provider_used VARCHAR(50),
  provider_transaction_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_sessions_ref ON deposit_sessions(user_reference);
CREATE INDEX IF NOT EXISTS idx_deposit_sessions_user_status ON deposit_sessions(user_id, status);

-- 3. Immutable Append-Only Deposit Session Events Table
CREATE TABLE IF NOT EXISTS deposit_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL REFERENCES deposit_sessions(session_id) ON DELETE CASCADE,
  previous_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  reason TEXT,
  actor VARCHAR(100) NOT NULL DEFAULT 'system',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to make deposit_session_events strictly IMMUTABLE (Append-Only)
CREATE OR REPLACE FUNCTION prevent_deposit_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'deposit_session_events table is strictly append-only. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_deposit_event_modification ON deposit_session_events;
CREATE TRIGGER trg_prevent_deposit_event_modification
BEFORE UPDATE OR DELETE ON deposit_session_events
FOR EACH ROW EXECUTE FUNCTION prevent_deposit_event_modification();

-- 4. Database-Driven Provider Capabilities Table
CREATE TABLE IF NOT EXISTS provider_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  feature VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  version VARCHAR(50) DEFAULT 'v1',
  in_maintenance BOOLEAN NOT NULL DEFAULT false,
  priority INT NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, feature)
);

-- Seed Provider Capabilities
INSERT INTO provider_capabilities (provider, feature, enabled, version, in_maintenance, priority)
VALUES
  ('fincra', 'deposit_bank_transfer', true, 'v1', false, 10),
  ('fincra', 'withdraw_bank_transfer', true, 'v1', false, 10),
  ('fincra', 'virtual_account', true, 'v1', false, 10),
  ('fincra', 'cards', true, 'v1', false, 10),
  ('fincra', 'ngn', true, 'v1', false, 10),
  ('fincra', 'webhook', true, 'v1', false, 10),
  ('grey', 'ach', true, 'v1', false, 10),
  ('grey', 'wire', true, 'v1', false, 10),
  ('grey', 'fx', true, 'v1', false, 10),
  ('grey', 'p2p', true, 'v1', false, 10),
  ('grey', 'usd', true, 'v1', false, 10),
  ('grey', 'virtual_account', true, 'v1', false, 10),
  ('grey', 'webhook', true, 'v1', false, 10)
ON CONFLICT (provider, feature) DO UPDATE 
SET enabled = EXCLUDED.enabled, updated_at = NOW();

-- 5. Deposit Fraud Risk Screening Logs Table
CREATE TABLE IF NOT EXISTS deposit_fraud_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  user_reference VARCHAR(100),
  risk_score INT NOT NULL,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_taken VARCHAR(50) NOT NULL,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Comprehensive Banking Audit Logs Table
CREATE TABLE IF NOT EXISTS banking_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  admin_id UUID,
  action VARCHAR(100) NOT NULL,
  provider VARCHAR(50),
  previous_values JSONB,
  new_values JSONB,
  reason TEXT,
  correlation_id VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  device_info VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Treasury Command Controls Table
CREATE TABLE IF NOT EXISTS treasury_command_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_key VARCHAR(100) NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  updated_by VARCHAR(100) NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Treasury Command Controls
INSERT INTO treasury_command_controls (control_key, enabled, reason)
VALUES
  ('pause_deposits', false, 'Normal operational state'),
  ('pause_withdrawals', false, 'Normal operational state'),
  ('pause_payouts', false, 'Normal operational state'),
  ('provider_maintenance_mode', false, 'Normal operational state'),
  ('emergency_ledger_lock', false, 'Normal operational state')
ON CONFLICT (control_key) DO NOTHING;
