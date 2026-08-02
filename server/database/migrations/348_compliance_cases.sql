-- 348_compliance_cases.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Compliance Investigation Case Management Repository

CREATE TABLE IF NOT EXISTS public.compliance_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_reference VARCHAR(100) NOT NULL UNIQUE,
  user_id VARCHAR(100) NOT NULL,
  trigger_event VARCHAR(100) NOT NULL DEFAULT 'AML_ALERT',
  severity VARCHAR(20) NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'ESCALATED', 'SAR_FILED', 'CLOSED')),
  investigator_notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.compliance_cases ADD COLUMN IF NOT EXISTS case_reference VARCHAR(100);
ALTER TABLE public.compliance_cases ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'OPEN';

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_comp_cases_ref'
  ) THEN
    ALTER TABLE public.compliance_cases ADD CONSTRAINT uq_comp_cases_ref UNIQUE (case_reference);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_comp_cases_status ON public.compliance_cases(status, severity);
