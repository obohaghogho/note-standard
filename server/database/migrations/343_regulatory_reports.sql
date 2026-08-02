-- 343_regulatory_reports.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Automated Regulatory Reporting Repository (SARs, CTRs, Daily Liquidity Reports)

CREATE TABLE IF NOT EXISTS public.regulatory_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('SAR', 'CTR', 'DAILY_LIQUIDITY', 'FINCEN_EXPORT')),
  period VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED', 'FILED')),
  file_path VARCHAR(255) DEFAULT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.regulatory_reports ADD COLUMN IF NOT EXISTS report_type VARCHAR(50) DEFAULT 'DAILY_LIQUIDITY';

-- Indices
CREATE INDEX IF NOT EXISTS idx_reg_reports_type_period ON public.regulatory_reports(report_type, period);
