-- 297_journals.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Journal headers (DRAFT, POSTED, REVERSED, VOID)

CREATE TABLE IF NOT EXISTS public.journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_period_id UUID REFERENCES public.accounting_periods(id) ON DELETE RESTRICT,
  reference VARCHAR(100) NOT NULL UNIQUE,
  entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'CONVERSION', 'FEE', 'ADJUSTMENT')),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED', 'VOID')),
  posted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journals_reference ON public.journals(reference);
CREATE INDEX IF NOT EXISTS idx_journals_status ON public.journals(status);
CREATE INDEX IF NOT EXISTS idx_journals_period ON public.journals(accounting_period_id);
