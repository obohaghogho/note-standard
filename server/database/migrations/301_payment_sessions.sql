-- 301_payment_sessions.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Append-Only Provider Checkout Sessions (v1..vN session rotation)

CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  session_version INT NOT NULL DEFAULT 1,
  provider VARCHAR(50) NOT NULL DEFAULT 'fincra',
  checkout_url TEXT,
  provider_reference VARCHAR(100),
  provider_session_id VARCHAR(100),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'COMPLETED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations for pre-existing tables
ALTER TABLE public.payment_sessions ADD COLUMN IF NOT EXISTS intent_id UUID;
ALTER TABLE public.payment_sessions ADD COLUMN IF NOT EXISTS session_version INT DEFAULT 1;
ALTER TABLE public.payment_sessions ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'fincra';
ALTER TABLE public.payment_sessions ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE public.payment_sessions ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(100);
ALTER TABLE public.payment_sessions ADD COLUMN IF NOT EXISTS provider_session_id VARCHAR(100);
ALTER TABLE public.payment_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour');

-- Constraint for append-only session rotation
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_payment_sessions_intent_version'
  ) THEN
    ALTER TABLE public.payment_sessions ADD CONSTRAINT uq_payment_sessions_intent_version UNIQUE(intent_id, session_version);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_payment_sessions_intent ON public.payment_sessions(intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_ref ON public.payment_sessions(provider_reference);
