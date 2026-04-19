-- =========================================================================
-- MIGRATION 139: ZERO-LOSS FINAL HARDENING & SAFE MODE
-- Implements System Governance, Trust Allowlists, and RPC Protection
-- =========================================================================

-- 1. Initialize Global Kill Switch in existing admin_settings table
-- (Table admin_settings already exists from Migration 123)
INSERT INTO admin_settings (key, value)
VALUES ('SYSTEM_MODE', '{"mode": "NORMAL"}')
ON CONFLICT (key) DO NOTHING;

-- 2. Add Trust Allowlists to Settlement Configs
ALTER TABLE settlement_configs 
    ADD COLUMN IF NOT EXISTS sender_domain_allowlist TEXT[] DEFAULT '{}';

-- Seed initial trusted domains
UPDATE settlement_configs SET sender_domain_allowlist = ARRAY['grey.co', 'sendgrid.com', 'brevo.com', 'clear.junction.com'] WHERE region = 'UK';
UPDATE settlement_configs SET sender_domain_allowlist = ARRAY['grey.co', 'mercury.com', 'brex.com', 'stripe.com'] WHERE region = 'US';

-- 3. TYPE CONVERSION & DATA SANITIZATION (Zero-Loss Strategy)
-- First, convert reference to TEXT to support alpha-numeric bank patterns (UK/US/SWIFT)
-- and permit disambiguation suffixes.
ALTER TABLE ledger_entries ALTER COLUMN reference TYPE TEXT;

-- Disambiguate historical duplicates (if any)
-- Find entries with identical (reference, amount, currency, wallet_id)
-- and suffix older ones with a replay tag to satisfy the upcoming unique index.
WITH duplicates AS (
    SELECT id, 
           ROW_NUMBER() OVER (
               PARTITION BY reference, amount, currency, wallet_id 
               ORDER BY created_at ASC, id ASC
           ) as row_idx
    FROM ledger_entries
)
UPDATE ledger_entries
SET reference = reference || ':REPLAY:' || id::text
WHERE id IN (SELECT id FROM duplicates WHERE row_idx > 1);

-- 4. Hardened Ledger Uniqueness
-- Prevents credit-matching collisions even if reference numbers are reused in other contexts
ALTER TABLE ledger_entries 
    DROP CONSTRAINT IF EXISTS unique_ledger_match_fingerprint;

ALTER TABLE ledger_entries 
    ADD CONSTRAINT unique_ledger_match_fingerprint 
    UNIQUE (reference, amount, currency, wallet_id);

-- 5. Admin Overrides Governance Table (Multi-Admin Approval)
CREATE TABLE IF NOT EXISTS admin_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,
    requested_by UUID NOT NULL REFERENCES profiles(id),
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending_approval', -- pending_approval, approved, rejected, executed
    approval_count INT DEFAULT 0,
    required_approvals INT DEFAULT 2, -- Default 2-of-N governance
    approved_by_ids UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

-- 6. UPGRADE confirm_deposit RPC with SAFE MODE check
CREATE OR REPLACE FUNCTION confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount DECIMAL,
    p_external_hash TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_status TEXT;
    v_current_balance DECIMAL;
    v_system_mode TEXT;
BEGIN
    -- ── Check System Mode (The Global Kill Switch) via admin_settings ──
    SELECT (value->>'mode') INTO v_system_mode FROM admin_settings WHERE key = 'SYSTEM_MODE';
    
    IF v_system_mode = 'SAFE' THEN
        RAISE EXCEPTION 'CRITICAL: System is in SAFE MODE. Automated wallet crediting is blocked due to integrity protection.';
    END IF;

    -- Lock the transaction row to prevent concurrent updates
    SELECT status INTO v_current_status
    FROM transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    -- Check if already completed (idempotency)
    IF v_current_status = 'COMPLETED' THEN
        RETURN;
    END IF;

    -- Standard validation
    IF v_current_status = 'FAILED' THEN
        RAISE EXCEPTION 'Cannot confirm a failed transaction';
    END IF;

    -- Lock wallet row 
    SELECT balance INTO v_current_balance
    FROM wallets_store -- Lock raw table, not view
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;

    -- Update raw wallet balance
    UPDATE wallets_store
    SET 
        balance = v_current_balance + p_amount,
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Update transaction status
    UPDATE transactions
    SET 
        status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        updated_at = NOW()
    WHERE id = p_transaction_id;

    -- ── TRIPLE-ID Audit Log Entry ──
    INSERT INTO audit_logs (reference, action, status, details)
    VALUES (p_transaction_id::text, 'confirm_deposit_execution', 'success', 
           jsonb_build_object('amount', p_amount, 'wallet_id', p_wallet_id, 'mode', v_system_mode));

END;
$$;
