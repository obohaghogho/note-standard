-- 317_recommendation_cache.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Ultra-Fast Routing Recommendation Cache

CREATE TABLE IF NOT EXISTS public.recommendation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key VARCHAR(100) NOT NULL UNIQUE,
  currency VARCHAR(10) NOT NULL,
  operation VARCHAR(50) NOT NULL,
  recommended_provider VARCHAR(50) NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  breakdown JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.recommendation_cache ADD COLUMN IF NOT EXISTS breakdown JSONB DEFAULT '{}'::jsonb;

-- Safe Unique Constraint Addition for ON CONFLICT (cache_key) DO NOTHING
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_recommendation_cache_key'
  ) THEN
    ALTER TABLE public.recommendation_cache ADD CONSTRAINT uq_recommendation_cache_key UNIQUE (cache_key);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_rec_cache_expires ON public.recommendation_cache(expires_at);
