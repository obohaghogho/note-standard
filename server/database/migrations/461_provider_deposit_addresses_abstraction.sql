-- ============================================================================
-- Migration 461: Provider Deposit Addresses Abstraction
-- ============================================================================
-- Purpose:
--   1. Create provider-neutral `provider_deposit_addresses` table to decouple NoteStandard's
--      crypto deposit address architecture from specific legacy provider naming.
--   2. Preserve existing `nowpayments_deposit_addresses` table untouched as legacy read-only infrastructure.
--   3. Enforce strict index structures and RLS policies for multi-provider compatibility.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.provider_deposit_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    asset TEXT NOT NULL,
    network TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    external_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_user_asset_network_address UNIQUE (provider, user_id, asset, network, address)
);

-- Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_provider_deposit_addresses_user_provider 
    ON public.provider_deposit_addresses(user_id, provider, asset, network);

CREATE INDEX IF NOT EXISTS idx_provider_deposit_addresses_address 
    ON public.provider_deposit_addresses(address);

CREATE INDEX IF NOT EXISTS idx_provider_deposit_addresses_ext_ref 
    ON public.provider_deposit_addresses(provider, external_reference);

-- Enable Row Level Security
ALTER TABLE public.provider_deposit_addresses ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS service_role_all_provider_addresses ON public.provider_deposit_addresses;
CREATE POLICY service_role_all_provider_addresses ON public.provider_deposit_addresses
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users read own deposit addresses
DROP POLICY IF EXISTS users_read_own_provider_addresses ON public.provider_deposit_addresses;
CREATE POLICY users_read_own_provider_addresses ON public.provider_deposit_addresses
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMIT;
