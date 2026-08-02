-- 327_slo_metrics.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Production SLO Performance Metrics & Telemetry Dashboard Repository

CREATE TABLE IF NOT EXISTS public.slo_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key VARCHAR(100) NOT NULL,
  availability_pct NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  latency_p50 INT NOT NULL DEFAULT 50,
  latency_p95 INT NOT NULL DEFAULT 150,
  latency_p99 INT NOT NULL DEFAULT 350,
  error_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  provider_success_pct NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.slo_metrics ADD COLUMN IF NOT EXISTS latency_p95 INT DEFAULT 150;

-- Indices
CREATE INDEX IF NOT EXISTS idx_slo_metrics_key_time ON public.slo_metrics(metric_key, recorded_at DESC);
