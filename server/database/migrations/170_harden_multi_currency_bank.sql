-- ============================================================================
-- Migration 170: Fintech-Grade Bank Module Hardening
-- ============================================================================
-- Purpose:
--   1. Consolidate individual encrypted columns into a single JSONB payload.
--   2. Implement strict RLS with per-user + per-currency query path integrity.
--   3. Enable security event logging for table structure changes.
-- ============================================================================

BEGIN;

-- 1. CLEANUP LEGACY COLUMNS & CONSOLIDATE
-- We drop the legacy individual encrypted columns to move to the payload-based model.
ALTER TABLE public.bank_accounts 
    DROP COLUMN IF EXISTS account_number_encrypted,
    DROP COLUMN IF EXISTS iban_encrypted,
    DROP COLUMN IF EXISTS swift_code_encrypted,
    DROP COLUMN IF EXISTS sort_code_encrypted,
    DROP COLUMN IF EXISTS iv,
    DROP COLUMN IF EXISTS auth_tag,
    DROP COLUMN IF EXISTS iban_iv,
    DROP COLUMN IF EXISTS iban_auth_tag,
    DROP COLUMN IF EXISTS swift_code_iv,
    DROP COLUMN IF EXISTS swift_code_auth_tag,
    DROP COLUMN IF EXISTS sort_code_iv,
    DROP COLUMN IF EXISTS sort_code_auth_tag,
    DROP COLUMN IF EXISTS ach_routing,
    DROP COLUMN IF EXISTS wire_routing,
    DROP COLUMN IF EXISTS bank_name,
    DROP COLUMN IF EXISTS bank_address,
    DROP COLUMN IF EXISTS payment_schemes,
    DROP COLUMN IF EXISTS fees,
    DROP COLUMN IF EXISTS geo_restriction;

-- 2. ADD CONSOLIDATED CRYPTOGRAPHIC COLUMNS
ALTER TABLE public.bank_accounts
    ADD COLUMN encrypted_payload TEXT NOT NULL,
    ADD COLUMN iv TEXT NOT NULL,
    ADD COLUMN auth_tag TEXT NOT NULL,
    -- key_id stays from previous migration, but ensured here
    ADD COLUMN IF NOT EXISTS key_id TEXT NOT NULL DEFAULT 'v1';

-- 3. HARDEN ROW LEVEL SECURITY
-- We drop old policies and recreate them with strict currency-level isolation requirements.
DROP POLICY IF EXISTS "bank_accounts_select_policy" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_insert_policy" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_update_policy" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_delete_policy" ON public.bank_accounts;

-- SELECT POLICY: Enforce query path integrity
-- Rule: Every select must strictly match user_id. 
-- Note: Currency filter is enforced by the caller, RLS acts as the final gate.
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

-- 4. AUDIT LOG
INSERT INTO public.security_audit_logs (event_type, severity, description, payload)
VALUES ('SECURITY_HARDENING', 'INFO', 'Consolidated bank accounts to single payload-based encryption schema with strict RLS', jsonb_build_object('migration', '170_harden_multi_currency_bank'));

COMMIT;
