-- ============================================================================
-- Migration 169: Multi-Currency Bank Support
-- ============================================================================
-- Purpose:
--   1. Extend bank_accounts to support GBP and EUR.
--   2. Add encrypted fields for IBAN, SWIFT, and Sort Codes.
--   3. Store multi-currency metadata like payment schemes and fees.
-- ============================================================================

BEGIN;

-- 1. ADD NEW COLUMNS TO BANK_ACCOUNTS
ALTER TABLE public.bank_accounts 
    -- IBAN (Sensitive)
    ADD COLUMN IF NOT EXISTS iban_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS iban_iv TEXT,
    ADD COLUMN IF NOT EXISTS iban_auth_tag TEXT,
    
    -- SWIFT Code (Sensitive)
    ADD COLUMN IF NOT EXISTS swift_code_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS swift_code_iv TEXT,
    ADD COLUMN IF NOT EXISTS swift_code_auth_tag TEXT,
    
    -- Sort Code (Sensitive, UK only)
    ADD COLUMN IF NOT EXISTS sort_code_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS sort_code_iv TEXT,
    ADD COLUMN IF NOT EXISTS sort_code_auth_tag TEXT,
    
    -- Metadata
    ADD COLUMN IF NOT EXISTS payment_schemes JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS fees JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS geo_restriction TEXT;

-- 2. UPDATE USD-SPECIFIC CONSTRAINTS
-- Existing constraint unique_user_usd_account was UNIQUE (user_id, currency)
-- Since it already uses currency, we don't need to rename it unless we want to be clean.
-- I'll keep the logic as is since it already allows one account per currency.

-- 3. AUDIT LOG
INSERT INTO public.security_audit_logs (event_type, severity, description, payload)
VALUES ('SYSTEM_MIGRATION', 'INFO', 'Extended bank_accounts table for multi-currency support (GBP/EUR)', jsonb_build_object('migration', '169_multi_currency_bank_support'));

COMMIT;
