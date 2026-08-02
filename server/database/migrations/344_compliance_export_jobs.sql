-- 344_compliance_export_jobs.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Automated Compliance Data Export Jobs Repository

CREATE TABLE IF NOT EXISTS public.compliance_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type VARCHAR(50) NOT NULL DEFAULT 'LEDGER_AUDIT',
  requested_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  download_url VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.compliance_export_jobs ADD COLUMN IF NOT EXISTS export_type VARCHAR(50) DEFAULT 'LEDGER_AUDIT';

-- Indices
CREATE INDEX IF NOT EXISTS idx_comp_export_status ON public.compliance_export_jobs(status, created_at DESC);
