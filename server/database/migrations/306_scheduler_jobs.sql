-- 306_scheduler_jobs.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Background Scheduler Registry & Job Execution History

CREATE TABLE IF NOT EXISTS public.scheduler_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name VARCHAR(100) NOT NULL UNIQUE,
  schedule VARCHAR(50) NOT NULL,
  timeout_ms INT NOT NULL DEFAULT 60000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ DEFAULT NULL,
  next_run_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scheduler_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name VARCHAR(100) NOT NULL REFERENCES public.scheduler_jobs(job_name) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NULL,
  duration_ms INT DEFAULT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT')),
  error_message TEXT DEFAULT NULL,
  trace_id VARCHAR(100),
  worker_id VARCHAR(100) DEFAULT 'worker_node_1'
);

-- Safe Schema Alterations for pre-existing tables
ALTER TABLE public.scheduler_jobs ADD COLUMN IF NOT EXISTS timeout_ms INT DEFAULT 60000;
ALTER TABLE public.scheduler_jobs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.scheduler_jobs ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

ALTER TABLE public.scheduler_job_runs ADD COLUMN IF NOT EXISTS duration_ms INT;
ALTER TABLE public.scheduler_job_runs ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);
ALTER TABLE public.scheduler_job_runs ADD COLUMN IF NOT EXISTS worker_id VARCHAR(100);

-- Seed Default Background Jobs
INSERT INTO public.scheduler_jobs (job_name, schedule, timeout_ms)
VALUES
  ('providerHealthJob', '*/1 * * * *', 30000),
  ('outboxPublisherJob', '*/5 * * * * *', 15000),
  ('staleIntentCleanupJob', '*/5 * * * *', 60000),
  ('reconcileProvidersJob', '0 2 * * *', 300000),
  ('fxQuoteRefreshJob', '*/1 * * * *', 30000),
  ('treasuryHealthJob', '*/5 * * * *', 60000),
  ('dlqRetryJob', '*/10 * * * *', 120000)
ON CONFLICT (job_name) DO NOTHING;

-- Indices
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_job ON public.scheduler_job_runs(job_name, started_at);
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_status ON public.scheduler_job_runs(status);
