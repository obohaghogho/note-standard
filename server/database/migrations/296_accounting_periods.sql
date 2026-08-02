-- 296_accounting_periods.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Accounting period management (OPEN, CLOSED, LOCKED, ARCHIVED)

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  year INT NOT NULL CHECK (year >= 2024 AND year <= 2100),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'LOCKED', 'ARCHIVED')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT uq_accounting_periods_month_year UNIQUE(month, year)
);

-- Seed current & default periods
INSERT INTO public.accounting_periods (month, year, status, opened_at)
VALUES 
  (EXTRACT(MONTH FROM NOW())::INT, EXTRACT(YEAR FROM NOW())::INT, 'OPEN', NOW())
ON CONFLICT (month, year) DO NOTHING;
