-- 322_provider_webhook_mapping.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Provider Webhook Event Normalization Mappings

CREATE TABLE IF NOT EXISTS public.provider_webhook_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  external_event_type VARCHAR(100) NOT NULL,
  normalized_event_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prov_webhook_map UNIQUE(provider, external_event_type)
);

-- Safe Schema Alterations
ALTER TABLE public.provider_webhook_mappings ADD COLUMN IF NOT EXISTS normalized_event_type VARCHAR(100);

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_prov_webhook_map'
  ) THEN
    ALTER TABLE public.provider_webhook_mappings ADD CONSTRAINT uq_prov_webhook_map UNIQUE (provider, external_event_type);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default Webhook Normalization Mappings
INSERT INTO public.provider_webhook_mappings (provider, external_event_type, normalized_event_type)
VALUES
  ('fincra', 'charge.successful', 'DepositSucceeded'),
  ('anchor', 'payment.settled', 'DepositSucceeded'),
  ('conduit', 'transaction.completed', 'DepositSucceeded'),
  ('fincra', 'payout.successful', 'WithdrawalCompleted'),
  ('anchor', 'transfer.completed', 'WithdrawalCompleted'),
  ('conduit', 'disbursement.settled', 'WithdrawalCompleted')
ON CONFLICT (provider, external_event_type) DO NOTHING;
