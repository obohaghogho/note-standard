-- 341_developer_webhooks.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- External Developer Webhook Subscriptions

CREATE TABLE IF NOT EXISTS public.developer_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(100) NOT NULL,
  target_url TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '["*"]'::jsonb,
  secret_key VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe Schema Alterations
ALTER TABLE public.developer_webhooks ADD COLUMN IF NOT EXISTS target_url TEXT;

-- Indices
CREATE INDEX IF NOT EXISTS idx_dev_webhooks_client ON public.developer_webhooks(client_id);
