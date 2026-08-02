-- 295_treasury_accounts.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Internal treasury accounts per currency mapped to Chart of Accounts

CREATE TABLE IF NOT EXISTS public.treasury_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency VARCHAR(10) NOT NULL,
  chart_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  account_category VARCHAR(30) NOT NULL CHECK (account_category IN ('AVAILABLE', 'RESERVE', 'SETTLEMENT', 'LIQUIDITY')),
  balance NUMERIC(20,8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_treasury_accounts_curr_cat UNIQUE(currency, account_category)
);

-- Seed Default Treasury Accounts for launch currencies (NGN, USD, EUR, GBP)
INSERT INTO public.treasury_accounts (currency, chart_account_id, account_category, balance)
VALUES
  ('NGN', (SELECT id FROM public.chart_of_accounts WHERE code = '1110'), 'AVAILABLE', 0),
  ('USD', (SELECT id FROM public.chart_of_accounts WHERE code = '1120'), 'AVAILABLE', 0),
  ('EUR', (SELECT id FROM public.chart_of_accounts WHERE code = '1130'), 'AVAILABLE', 0),
  ('GBP', (SELECT id FROM public.chart_of_accounts WHERE code = '1140'), 'AVAILABLE', 0),
  ('NGN', (SELECT id FROM public.chart_of_accounts WHERE code = '1150'), 'RESERVE', 0),
  ('USD', (SELECT id FROM public.chart_of_accounts WHERE code = '1150'), 'RESERVE', 0),
  ('NGN', (SELECT id FROM public.chart_of_accounts WHERE code = '1160'), 'SETTLEMENT', 0),
  ('USD', (SELECT id FROM public.chart_of_accounts WHERE code = '1160'), 'SETTLEMENT', 0)
ON CONFLICT (currency, account_category) DO NOTHING;
