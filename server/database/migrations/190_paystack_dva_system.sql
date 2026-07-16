-- Migration 190: Paystack Dedicated Virtual Accounts (DVA) System
-- Purpose: Store and manage dedicated virtual accounts for users to ensure stable NGN transfers.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dedicated_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'paystack',
    provider_customer_code TEXT, -- e.g. Paystack Customer Code
    provider_account_id TEXT, -- e.g. Paystack Dedicated Account ID
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'NGN',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure one DVA per user/provider/currency combo
    CONSTRAINT unique_user_provider_currency_dva UNIQUE (user_id, provider, currency)
);

-- Index for fast lookup by account number (for webhooks if needed)
CREATE INDEX IF NOT EXISTS idx_dedicated_accounts_number ON public.dedicated_accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_dedicated_accounts_user_id ON public.dedicated_accounts(user_id);

-- Enable RLS
ALTER TABLE public.dedicated_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own dedicated accounts" ON public.dedicated_accounts;
CREATE POLICY "Users can view their own dedicated accounts" 
    ON public.dedicated_accounts FOR SELECT 
    USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_dedicated_accounts_updated_at ON public.dedicated_accounts;
CREATE TRIGGER set_dedicated_accounts_updated_at
    BEFORE UPDATE ON public.dedicated_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Add dedicated_account_id to payments table for better tracking
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS dedicated_account_id UUID REFERENCES public.dedicated_accounts(id);

-- Add paystack_customer_code to profiles for global tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;

COMMIT;
