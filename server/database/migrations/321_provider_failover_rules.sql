-- 321_provider_failover_rules.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Failover Error Classification Policies (Retryable vs Business Rule Validation)

CREATE TABLE IF NOT EXISTS public.provider_failover_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code VARCHAR(100) NOT NULL UNIQUE,
  classification VARCHAR(50) NOT NULL CHECK (classification IN ('RETRYABLE_INFRASTRUCTURE', 'BUSINESS_VALIDATION')),
  allow_failover BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.provider_failover_rules ADD COLUMN IF NOT EXISTS allow_failover BOOLEAN DEFAULT false;

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_failover_rules_code'
  ) THEN
    ALTER TABLE public.provider_failover_rules ADD CONSTRAINT uq_failover_rules_code UNIQUE (error_code);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Failover Rules
INSERT INTO public.provider_failover_rules (error_code, classification, allow_failover)
VALUES
  ('GATEWAY_TIMEOUT_504', 'RETRYABLE_INFRASTRUCTURE', true),
  ('SERVICE_UNAVAILABLE_503', 'RETRYABLE_INFRASTRUCTURE', true),
  ('CONNECTION_RESET', 'RETRYABLE_INFRASTRUCTURE', true),
  ('INSUFFICIENT_FUNDS', 'BUSINESS_VALIDATION', false),
  ('INVALID_ACCOUNT_NUMBER', 'BUSINESS_VALIDATION', false),
  ('KYC_VERIFICATION_FAILED', 'BUSINESS_VALIDATION', false)
ON CONFLICT (error_code) DO NOTHING;
