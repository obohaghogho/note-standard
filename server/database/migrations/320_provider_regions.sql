-- 320_provider_regions.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Regional Availability & Geographic Routing Mappings

CREATE TABLE IF NOT EXISTS public.provider_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  region_code VARCHAR(10) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prov_region UNIQUE(provider, region_code, currency)
);

-- Safe Schema Alterations
ALTER TABLE public.provider_regions ADD COLUMN IF NOT EXISTS priority INT DEFAULT 1;

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_prov_region'
  ) THEN
    ALTER TABLE public.provider_regions ADD CONSTRAINT uq_prov_region UNIQUE (provider, region_code, currency);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Regions
INSERT INTO public.provider_regions (provider, region_code, currency, priority)
VALUES
  ('fincra', 'NG', 'NGN', 1),
  ('anchor', 'NG', 'NGN', 2),
  ('anchor', 'US', 'USD', 1),
  ('conduit', 'US', 'USD', 1),
  ('conduit', 'EU', 'EUR', 1)
ON CONFLICT (provider, region_code, currency) DO NOTHING;
