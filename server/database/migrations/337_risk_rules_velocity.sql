-- 337_risk_rules_velocity.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Centralized Risk Rules & Velocity Limit Controls

CREATE TABLE IF NOT EXISTS public.risk_rules_velocity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name VARCHAR(100) NOT NULL UNIQUE,
  max_amount_per_tx NUMERIC(20,8) NOT NULL DEFAULT 5000000.00,
  max_daily_amount NUMERIC(20,8) NOT NULL DEFAULT 20000000.00,
  max_daily_tx_count INT NOT NULL DEFAULT 50,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.risk_rules_velocity ADD COLUMN IF NOT EXISTS rule_name VARCHAR(100);
ALTER TABLE public.risk_rules_velocity ADD COLUMN IF NOT EXISTS max_amount_per_tx NUMERIC(20,8) DEFAULT 5000000.00;

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_risk_rules_name'
  ) THEN
    ALTER TABLE public.risk_rules_velocity ADD CONSTRAINT uq_risk_rules_name UNIQUE (rule_name);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Velocity Rules
INSERT INTO public.risk_rules_velocity (rule_name, max_amount_per_tx, max_daily_amount, max_daily_tx_count)
VALUES
  ('DEFAULT_USER_VELOCITY', 5000000.00, 20000000.00, 50),
  ('VIP_ENTERPRISE_VELOCITY', 50000000.00, 200000000.00, 500)
ON CONFLICT (rule_name) DO NOTHING;
