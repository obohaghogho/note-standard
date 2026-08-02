-- 334_disaster_recovery_backups.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Automated DR Backup Validation & RPO/RTO Audit Repository

CREATE TABLE IF NOT EXISTS public.disaster_recovery_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type VARCHAR(50) NOT NULL DEFAULT 'SNAPSHOT',
  rpo_minutes INT NOT NULL DEFAULT 5,
  rto_minutes INT NOT NULL DEFAULT 15,
  status VARCHAR(20) NOT NULL DEFAULT 'VALIDATED' CHECK (status IN ('VALIDATED', 'FAILED')),
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.disaster_recovery_backups ADD COLUMN IF NOT EXISTS rpo_minutes INT DEFAULT 5;

-- Indices
CREATE INDEX IF NOT EXISTS idx_dr_backups_status ON public.disaster_recovery_backups(status, validated_at DESC);
