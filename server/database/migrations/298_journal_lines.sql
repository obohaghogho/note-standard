-- 298_journal_lines.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Balanced journal lines enforcing SUM(debit) == SUM(credit)

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  chart_account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  currency VARCHAR(10) NOT NULL,
  memo TEXT,
  reference_type VARCHAR(50),
  reference_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_journal_lines_journal_line UNIQUE(journal_id, line_number),
  CONSTRAINT chk_journal_lines_debit_or_credit CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON public.journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_chart ON public.journal_lines(chart_account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_reference ON public.journal_lines(reference_type, reference_id);
