-- 311_health_metrics.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- System Health Metrics & Observability Telemetry Repository

CREATE TABLE IF NOT EXISTS public.health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(100) NOT NULL,
  metric_value NUMERIC(12,4) NOT NULL,
  labels JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.health_metrics ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '{}'::jsonb;

-- Indices
CREATE INDEX IF NOT EXISTS idx_health_metrics_name_time ON public.health_metrics(metric_name, recorded_at);
