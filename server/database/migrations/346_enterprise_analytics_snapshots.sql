-- 346_enterprise_analytics_snapshots.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Enterprise Analytics & Executive Telemetry Repository

CREATE TABLE IF NOT EXISTS public.enterprise_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_transaction_volume NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  total_successful_payments INT NOT NULL DEFAULT 0,
  total_failed_payments INT NOT NULL DEFAULT 0,
  net_revenue NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.enterprise_analytics_snapshots ADD COLUMN IF NOT EXISTS total_transaction_volume NUMERIC(20,8) DEFAULT 0.00;

-- Indices
CREATE INDEX IF NOT EXISTS idx_analytics_snap_date ON public.enterprise_analytics_snapshots(snapshot_date DESC);
