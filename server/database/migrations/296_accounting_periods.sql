-- 296_accounting_periods.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Accounting period management (OPEN, CLOSED, LOCKED, ARCHIVED)

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_code VARCHAR(20) UNIQUE,
  month INT CHECK (month >= 1 AND month <= 12),
  year INT CHECK (year >= 2024 AND year <= 2100),
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 month',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'LOCKED', 'ARCHIVED')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ DEFAULT NULL
);

-- Safe Schema Alterations for existing table instances (e.g., from migration 275)
ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS period_code VARCHAR(20);
ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS month INT CHECK (month >= 1 AND month <= 12);
ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS year INT CHECK (year >= 2024 AND year <= 2100);
ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill month and year for existing records if null
UPDATE public.accounting_periods 
SET 
  month = COALESCE(month, EXTRACT(MONTH FROM NOW())::INT),
  year = COALESCE(year, EXTRACT(YEAR FROM NOW())::INT)
WHERE month IS NULL OR year IS NULL;

-- Add Unique Constraint if not present
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_accounting_periods_month_year'
  ) THEN
    ALTER TABLE public.accounting_periods ADD CONSTRAINT uq_accounting_periods_month_year UNIQUE(month, year);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed current & default period
INSERT INTO public.accounting_periods (period_code, month, year, status, opened_at)
VALUES 
  (
    TO_CHAR(NOW(), 'YYYY-MM'),
    EXTRACT(MONTH FROM NOW())::INT,
    EXTRACT(YEAR FROM NOW())::INT,
    'OPEN',
    NOW()
  )
ON CONFLICT DO NOTHING;
