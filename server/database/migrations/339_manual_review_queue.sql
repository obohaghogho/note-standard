-- 339_manual_review_queue.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- High-Risk Transaction Manual Review Queue Repository

CREATE TABLE IF NOT EXISTS public.manual_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by VARCHAR(100) DEFAULT NULL,
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.manual_review_queue ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING';

-- Indices
CREATE INDEX IF NOT EXISTS idx_manual_review_status ON public.manual_review_queue(status, created_at DESC);
