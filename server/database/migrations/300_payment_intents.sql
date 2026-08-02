-- 300_payment_intents.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Payment Intent business request model (CREATED, ACTIVE, COMPLETED, CANCELLED, EXPIRED)

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_account_id UUID REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  currency VARCHAR(10) NOT NULL,
  amount NUMERIC(20,8) NOT NULL CHECK (amount > 0),
  purpose VARCHAR(50) NOT NULL CHECK (purpose IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'CONVERSION', 'FEE')),
  provider VARCHAR(50) NOT NULL DEFAULT 'fincra',
  status VARCHAR(20) NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations for pre-existing tables
ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS wallet_account_id UUID;
ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS amount NUMERIC(20,8);
ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS purpose VARCHAR(50);
ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'fincra';
ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'CREATED';
ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour');

-- Indices for rapid user & status queries
CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON public.payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON public.payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_currency ON public.payment_intents(currency);
