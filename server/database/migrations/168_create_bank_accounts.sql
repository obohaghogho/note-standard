-- ============================================================================
-- Migration 168: Secure USD Bank Accounts (Hardened)
-- ============================================================================
-- Purpose:
--   1. Store encrypted bank account details for users with key versioning.
--   2. Implement strict RLS to ensure zero cross-user leakage.
--   3. Enable security auditing for all bank-related activities.
-- ============================================================================

BEGIN;

-- 1. CREATE BANK_ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_holder TEXT NOT NULL,
    account_number_encrypted TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    key_id TEXT NOT NULL DEFAULT 'v1', -- To support key rotation
    ach_routing TEXT NOT NULL,
    wire_routing TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    bank_address TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    account_type TEXT NOT NULL DEFAULT 'checking',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure one USD bank account per user for now
    CONSTRAINT unique_user_usd_account UNIQUE (user_id, currency)
);

-- 2. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- 3. CREATE RLS POLICIES (Comprehensive)
DROP POLICY IF EXISTS "Users can only view their own bank details" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can only insert their own bank details" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can only update their own bank details" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can only delete their own bank details" ON public.bank_accounts;

CREATE POLICY "bank_accounts_select_policy" 
    ON public.bank_accounts FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "bank_accounts_insert_policy" 
    ON public.bank_accounts FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bank_accounts_update_policy" 
    ON public.bank_accounts FOR UPDATE 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bank_accounts_delete_policy" 
    ON public.bank_accounts FOR DELETE 
    USING (auth.uid() = user_id);

-- 4. AUTO-UPDATE UPDATED_AT
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER set_bank_accounts_updated_at
    BEFORE UPDATE ON public.bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. INITIAL AUDIT LOG FOR TABLE CREATION
INSERT INTO public.security_audit_logs (event_type, severity, description, payload)
VALUES ('SYSTEM_MIGRATION', 'INFO', 'Created bank_accounts table with hardened RLS and key versioning', jsonb_build_object('migration', '168_create_bank_accounts_hardened'));

COMMIT;
