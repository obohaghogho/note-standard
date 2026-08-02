-- 326_release_audits.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Immutable Production Deployment Release Audits

CREATE TABLE IF NOT EXISTS public.release_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_version VARCHAR(50) NOT NULL,
  git_commit VARCHAR(100) NOT NULL,
  migration_version VARCHAR(50) NOT NULL,
  environment VARCHAR(20) NOT NULL DEFAULT 'production',
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'FAILED', 'ROLLED_BACK')),
  duration_ms INT NOT NULL DEFAULT 0,
  trace_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.release_audits ADD COLUMN IF NOT EXISTS git_commit VARCHAR(100);

-- Indices
CREATE INDEX IF NOT EXISTS idx_release_version ON public.release_audits(release_version);
