-- ============================================================================
-- MIGRATION 403: Enterprise Currency Release Management & Governance Engine
-- ============================================================================
-- Features:
-- 1. Database-backed Runtime Feature Flags
-- 2. Separation of Release Status (DEVELOPMENT, BETA, PENDING_APPROVAL, LIVE, DEPRECATED) 
--    and Health Status (HEALTHY, MAINTENANCE, DEGRADED, DISABLED)
-- 3. Maker-Checker Two-Person Approval workflow
-- 4. Scheduled Future Releases
-- 5. Canary Phased Rollouts (canary_percentage: 0-100%)
-- 6. Region-Based Jurisdiction Availability
-- 7. Automated Provider Health Scoring & Auto-Rollback triggers
-- 8. Immutable Append-Only Audit Logging with trigger enforcement
-- ============================================================================

CREATE TABLE IF NOT EXISTS currency_release_settings (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  flag VARCHAR(10) NOT NULL,
  release_status VARCHAR(30) NOT NULL DEFAULT 'DEVELOPMENT' 
    CHECK (release_status IN ('DEVELOPMENT', 'BETA', 'PENDING_APPROVAL', 'LIVE', 'DEPRECATED')),
  health_status VARCHAR(30) NOT NULL DEFAULT 'HEALTHY' 
    CHECK (health_status IN ('HEALTHY', 'MAINTENANCE', 'DEGRADED', 'DISABLED')),
  auto_health_enabled BOOLEAN NOT NULL DEFAULT true,
  canary_percentage INT NOT NULL DEFAULT 100 CHECK (canary_percentage BETWEEN 0 AND 100),
  allowed_regions TEXT[] NOT NULL DEFAULT ARRAY['ALL'],
  scheduled_at TIMESTAMPTZ,
  requested_by VARCHAR(100),
  requested_at TIMESTAMPTZ,
  approved_by VARCHAR(100),
  approved_at TIMESTAMPTZ,
  can_deposit BOOLEAN NOT NULL DEFAULT true,
  can_withdraw BOOLEAN NOT NULL DEFAULT true,
  can_transfer BOOLEAN NOT NULL DEFAULT true,
  can_swap BOOLEAN NOT NULL DEFAULT true,
  can_card BOOLEAN NOT NULL DEFAULT false,
  banking_provider VARCHAR(50) DEFAULT 'grey',
  card_provider VARCHAR(50) DEFAULT 'fincra',
  fx_provider VARCHAR(50) DEFAULT 'grey',
  settlement_provider VARCHAR(50) DEFAULT 'grey',
  maintenance_notice TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS currency_release_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL,
  admin_id UUID,
  admin_email VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  previous_status VARCHAR(30),
  new_status VARCHAR(30),
  previous_health VARCHAR(30),
  new_health VARCHAR(30),
  previous_values JSONB,
  new_values JSONB,
  reason TEXT,
  ip_address VARCHAR(45),
  correlation_id VARCHAR(100),
  release_version VARCHAR(50) DEFAULT 'v1.3.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to make currency_release_audit_logs strictly IMMUTABLE (Append-Only)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'currency_release_audit_logs table is strictly append-only. UPDATE and DELETE actions are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_modification ON currency_release_audit_logs;
CREATE TRIGGER trg_prevent_audit_log_modification
BEFORE UPDATE OR DELETE ON currency_release_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- Seed Default Currency Settings
INSERT INTO currency_release_settings 
  (code, name, symbol, flag, release_status, health_status, canary_percentage, allowed_regions, can_deposit, can_withdraw, can_transfer, can_swap, can_card, banking_provider, card_provider, fx_provider, settlement_provider)
VALUES
  ('NGN', 'Nigerian Naira', '₦', '🇳🇬', 'LIVE', 'HEALTHY', 100, ARRAY['ALL'], true, true, true, true, true, 'fincra', 'fincra', 'fincra', 'fincra'),
  ('USD', 'US Dollar', '$', '🇺🇸', 'LIVE', 'HEALTHY', 100, ARRAY['ALL'], true, true, true, true, false, 'grey', 'fincra', 'grey', 'grey'),
  ('EUR', 'Euro', '€', '🇪🇺', 'DEVELOPMENT', 'HEALTHY', 100, ARRAY['ALL'], false, false, false, false, false, 'grey', 'fincra', 'grey', 'grey'),
  ('GBP', 'British Pound', '£', '🇬🇧', 'DEVELOPMENT', 'HEALTHY', 100, ARRAY['ALL'], false, false, false, false, false, 'grey', 'fincra', 'grey', 'grey'),
  ('CAD', 'Canadian Dollar', 'CA$', '🇨🇦', 'DEVELOPMENT', 'HEALTHY', 100, ARRAY['ALL'], false, false, false, false, false, 'grey', 'fincra', 'grey', 'grey'),
  ('AUD', 'Australian Dollar', 'A$', '🇦🇺', 'DEVELOPMENT', 'HEALTHY', 100, ARRAY['ALL'], false, false, false, false, false, 'grey', 'fincra', 'grey', 'grey'),
  ('ZAR', 'South African Rand', 'R', '🇿🇦', 'DEVELOPMENT', 'HEALTHY', 100, ARRAY['ALL'], false, false, false, false, false, 'grey', 'fincra', 'grey', 'grey'),
  ('GHS', 'Ghanaian Cedi', 'GH₵', '🇬🇭', 'DEVELOPMENT', 'HEALTHY', 100, ARRAY['ALL'], false, false, false, false, false, 'fincra', 'fincra', 'fincra', 'fincra')
ON CONFLICT (code) DO NOTHING;
