-- Migration 490: Ensure admin_audit_logs target_id is TEXT to allow non-UUID identifiers
-- Fixes PostgreSQL 22P02 invalid input syntax error for string targets like 'GLOBAL', 'all', 'REF-123', etc.

ALTER TABLE IF EXISTS admin_audit_logs ALTER COLUMN target_id TYPE TEXT;

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_type_idx ON admin_audit_logs(target_type);
