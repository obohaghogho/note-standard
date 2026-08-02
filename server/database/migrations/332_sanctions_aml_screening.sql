-- 332_sanctions_aml_screening.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Real-Time Sanctions Screening & AML Compliance Audit Repository

CREATE TABLE IF NOT EXISTS public.sanctions_aml_screening (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  screening_provider VARCHAR(50) NOT NULL DEFAULT 'OFAC_PEPS_SCREEN',
  status VARCHAR(20) NOT NULL DEFAULT 'CLEARED' CHECK (status IN ('CLEARED', 'FLAGGED', 'BLOCKED')),
  hit_details JSONB DEFAULT '{}'::jsonb,
  screened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.sanctions_aml_screening ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'CLEARED';

-- Indices
CREATE INDEX IF NOT EXISTS idx_sanctions_user_status ON public.sanctions_aml_screening(user_id, status);
