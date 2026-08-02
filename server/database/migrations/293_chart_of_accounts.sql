-- 293_chart_of_accounts.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Hierarchical Chart of Accounts for Double-Entry Accounting

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY')),
  parent_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  level INT NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 5),
  currency VARCHAR(10) DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations for existing table instances
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS parent_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS level INT DEFAULT 1;
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Indices for rapid hierarchy lookups
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_code ON public.chart_of_accounts(code);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent ON public.chart_of_accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type ON public.chart_of_accounts(type);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_currency ON public.chart_of_accounts(currency);

-- Seed Root & Hierarchical Accounts
INSERT INTO public.chart_of_accounts (code, name, type, parent_account_id, level, currency)
VALUES 
  ('1000', 'Assets', 'ASSET', NULL, 1, NULL),
  ('2000', 'Liabilities', 'LIABILITY', NULL, 1, NULL),
  ('3000', 'Revenue', 'REVENUE', NULL, 1, NULL),
  ('4000', 'Expenses', 'EXPENSE', NULL, 1, NULL),
  ('5000', 'Equity', 'EQUITY', NULL, 1, NULL)
ON CONFLICT (code) DO NOTHING;

-- Seed Level 2 Sub-Accounts
INSERT INTO public.chart_of_accounts (code, name, type, parent_account_id, level, currency)
VALUES
  ('1100', 'Treasury Accounts', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1000'), 2, NULL),
  ('1200', 'Settlement Clearing', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1000'), 2, NULL),
  ('1300', 'Reserve Accounts', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1000'), 2, NULL),
  ('2100', 'Customer Wallets', 'LIABILITY', (SELECT id FROM public.chart_of_accounts WHERE code = '2000'), 2, NULL),
  ('2200', 'Pending Deposits', 'LIABILITY', (SELECT id FROM public.chart_of_accounts WHERE code = '2000'), 2, NULL),
  ('2300', 'Pending Withdrawals', 'LIABILITY', (SELECT id FROM public.chart_of_accounts WHERE code = '2000'), 2, NULL),
  ('3100', 'Deposit Fees', 'REVENUE', (SELECT id FROM public.chart_of_accounts WHERE code = '3000'), 2, NULL),
  ('3200', 'Withdrawal Fees', 'REVENUE', (SELECT id FROM public.chart_of_accounts WHERE code = '3000'), 2, NULL),
  ('3300', 'FX Revenue', 'REVENUE', (SELECT id FROM public.chart_of_accounts WHERE code = '3000'), 2, NULL),
  ('4100', 'Provider Fees', 'EXPENSE', (SELECT id FROM public.chart_of_accounts WHERE code = '4000'), 2, NULL),
  ('4200', 'Chargebacks', 'EXPENSE', (SELECT id FROM public.chart_of_accounts WHERE code = '4000'), 2, NULL),
  ('4300', 'Refunds', 'EXPENSE', (SELECT id FROM public.chart_of_accounts WHERE code = '4000'), 2, NULL),
  ('5100', 'Owner Equity', 'EQUITY', (SELECT id FROM public.chart_of_accounts WHERE code = '5000'), 2, NULL),
  ('5200', 'Retained Earnings', 'EQUITY', (SELECT id FROM public.chart_of_accounts WHERE code = '5000'), 2, NULL)
ON CONFLICT (code) DO NOTHING;

-- Seed Level 3 Per-Currency Accounts
INSERT INTO public.chart_of_accounts (code, name, type, parent_account_id, level, currency)
VALUES
  ('1110', 'Treasury NGN Available', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1100'), 3, 'NGN'),
  ('1120', 'Treasury USD Available', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1100'), 3, 'USD'),
  ('1130', 'Treasury EUR Available', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1100'), 3, 'EUR'),
  ('1140', 'Treasury GBP Available', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1100'), 3, 'GBP'),
  ('1150', 'Treasury Reserve Account', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1100'), 3, NULL),
  ('1160', 'Treasury Settlement Account', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1100'), 3, NULL),
  ('1170', 'Treasury Liquidity Account', 'ASSET', (SELECT id FROM public.chart_of_accounts WHERE code = '1100'), 3, NULL),
  ('2110', 'Customer NGN Wallets', 'LIABILITY', (SELECT id FROM public.chart_of_accounts WHERE code = '2100'), 3, 'NGN'),
  ('2120', 'Customer USD Wallets', 'LIABILITY', (SELECT id FROM public.chart_of_accounts WHERE code = '2100'), 3, 'USD'),
  ('2130', 'Customer EUR Wallets', 'LIABILITY', (SELECT id FROM public.chart_of_accounts WHERE code = '2100'), 3, 'EUR'),
  ('2140', 'Customer GBP Wallets', 'LIABILITY', (SELECT id FROM public.chart_of_accounts WHERE code = '2100'), 3, 'GBP')
ON CONFLICT (code) DO NOTHING;
