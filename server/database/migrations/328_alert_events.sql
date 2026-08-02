-- 328_alert_events.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Production Operational Alert Repository

CREATE TABLE IF NOT EXISTS public.alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  component VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ DEFAULT NULL
);

-- Safe Schema Alterations
ALTER TABLE public.alert_events ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'INFO';

-- Indices
CREATE INDEX IF NOT EXISTS idx_alert_events_sev ON public.alert_events(severity, opened_at DESC);
