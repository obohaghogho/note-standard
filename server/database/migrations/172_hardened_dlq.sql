-- Migration: 172_hardened_dlq.sql
-- Hardens recovery forensics with causal lineage and state snapshots

-- 1. Ensure columns exist and add causal linkages
ALTER TABLE dead_letter_webhooks 
ADD COLUMN IF NOT EXISTS event_causal_parent_id UUID,
ADD COLUMN IF NOT EXISTS event_causal_root_id UUID,
ADD COLUMN IF NOT EXISTS context_snapshot JSONB,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- 2. Add indices for settlement chain reconstruction
CREATE INDEX IF NOT EXISTS idx_dlq_causal_parent ON dead_letter_webhooks(event_causal_parent_id);
CREATE INDEX IF NOT EXISTS idx_dlq_causal_root ON dead_letter_webhooks(event_causal_root_id);

-- 3. Add audit comment
COMMENT ON TABLE dead_letter_webhooks IS 'Institutional-grade DLQ with settlement chain forensics and causal DAG reconstruction capabilities.';
