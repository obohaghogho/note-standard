-- 345_audit_trail_explorer.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Audit Trail Search Index Repository

CREATE TABLE IF NOT EXISTS public.audit_trail_explorer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  actor VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  changes JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.audit_trail_explorer ADD COLUMN IF NOT EXISTS changes JSONB DEFAULT '{}'::jsonb;

-- Indices
CREATE INDEX IF NOT EXISTS idx_audit_explorer_entity ON public.audit_trail_explorer(entity_id, recorded_at DESC);
