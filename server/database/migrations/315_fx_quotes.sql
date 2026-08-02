-- 315_fx_quotes.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Locked FX Rate Quotes with Configurable TTL & Expiration Policies

CREATE TABLE IF NOT EXISTS public.fx_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id VARCHAR(100) NOT NULL UNIQUE,
  base_currency VARCHAR(10) NOT NULL,
  quote_currency VARCHAR(10) NOT NULL,
  mid_rate NUMERIC(20,8) NOT NULL,
  spread NUMERIC(10,6) NOT NULL DEFAULT 0.005,
  locked_rate NUMERIC(20,8) NOT NULL,
  amount NUMERIC(20,8) NOT NULL CHECK (amount > 0),
  converted_amount NUMERIC(20,8) NOT NULL CHECK (converted_amount > 0),
  provider VARCHAR(50) NOT NULL DEFAULT 'fincra',
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACCEPTED', 'EXPIRED', 'CANCELLED')),
  trace_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.fx_quotes ADD COLUMN IF NOT EXISTS spread NUMERIC(10,6) DEFAULT 0.005;
ALTER TABLE public.fx_quotes ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);

-- Safe Unique Constraint Addition for ON CONFLICT (quote_id) DO NOTHING
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_fx_quotes_quote_id'
  ) THEN
    ALTER TABLE public.fx_quotes ADD CONSTRAINT uq_fx_quotes_quote_id UNIQUE (quote_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_fx_quotes_status ON public.fx_quotes(status);
CREATE INDEX IF NOT EXISTS idx_fx_quotes_expires ON public.fx_quotes(expires_at);
