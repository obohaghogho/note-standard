-- 308_circuit_breakers.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Provider Circuit Breaker State Machine & Operational Counters

CREATE TABLE IF NOT EXISTS public.circuit_breakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL UNIQUE,
  state VARCHAR(20) NOT NULL DEFAULT 'CLOSED' CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_threshold INT NOT NULL DEFAULT 5,
  recovery_timeout_sec INT NOT NULL DEFAULT 60,
  half_open_probes INT NOT NULL DEFAULT 3,
  successful_requests INT NOT NULL DEFAULT 0,
  failed_requests INT NOT NULL DEFAULT 0,
  timeouts INT NOT NULL DEFAULT 0,
  rejections INT NOT NULL DEFAULT 0,
  tripped_at TIMESTAMPTZ DEFAULT NULL,
  recovery_at TIMESTAMPTZ DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations for pre-existing tables
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'CLOSED';
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS failure_threshold INT DEFAULT 5;
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS recovery_timeout_sec INT DEFAULT 60;
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS half_open_probes INT DEFAULT 3;
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS successful_requests INT DEFAULT 0;
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS failed_requests INT DEFAULT 0;
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS timeouts INT DEFAULT 0;
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS rejections INT DEFAULT 0;

-- Seed Default Circuit Breaker Records
INSERT INTO public.circuit_breakers (provider, state)
VALUES
  ('fincra', 'CLOSED'),
  ('anchor', 'CLOSED'),
  ('conduit', 'CLOSED')
ON CONFLICT (provider) DO NOTHING;

-- Indices
CREATE INDEX IF NOT EXISTS idx_circuit_breakers_state ON public.circuit_breakers(state);
