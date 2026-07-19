-- Migration 215: Virtual Account System Upgrades
-- Purpose: Add virtual_account_enabled capability to supported_currencies and track provisioning status in dedicated_accounts.

BEGIN;

-- 1. Add virtual_account_enabled to supported_currencies
ALTER TABLE public.supported_currencies 
ADD COLUMN IF NOT EXISTS virtual_account_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Add status to dedicated_accounts table for provisioning lifecycle
ALTER TABLE public.dedicated_accounts 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE' 
CHECK (status IN ('NOT_REQUESTED', 'PROCESSING', 'ACTIVE', 'FAILED', 'SUSPENDED'));

-- 3. Update existing NGN seed to support virtual accounts
UPDATE public.supported_currencies 
SET virtual_account_enabled = true 
WHERE code = 'NGN';

COMMIT;
