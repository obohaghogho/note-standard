-- Migration: Auto-provisioning system wallets for ledger deposits
-- Description: Drops the restrictive unique_user_currency constraint to allow system/settlement wallets to be securely auto-provisioned inside the confirm_deposit RPC without crashing the ledger.

BEGIN;

-- 1. Relax the unique_user_currency constraint to only apply to personal user wallets
ALTER TABLE wallets_store DROP CONSTRAINT IF EXISTS unique_user_currency;
CREATE UNIQUE INDEX IF NOT EXISTS unique_personal_wallet ON wallets_store (user_id, currency) 
WHERE address NOT LIKE 'SETTLEMENT_%' 
  AND address NOT LIKE 'SYSTEM_%' 
  AND address NOT LIKE 'WITHDRAWAL_%' 
  AND address NOT LIKE 'FX_%';

-- 2. Ensure system user exists (Required for wallets_store user_id FK)
INSERT INTO auth.users (id, instance_id, aud, role, email) 
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'system@note.internal') 
ON CONFLICT (id) DO NOTHING;

-- 3. Update confirm_deposit RPC to auto-provision settlement wallets dynamically
CREATE OR REPLACE FUNCTION public.confirm_deposit(p_transaction_id uuid, p_wallet_id uuid, p_amount numeric, p_external_hash text DEFAULT NULL::text, p_override boolean DEFAULT false, p_override_reason text DEFAULT 'late_provider_success'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID;
    v_currency VARCHAR;
    v_status VARCHAR;
    v_metadata JSONB;
    v_idempotency_key TEXT;
    v_provider VARCHAR;
    v_sys_address TEXT;
    v_sys_wallet_id UUID;
    v_entries JSONB;
    v_v6_tx_id UUID;
BEGIN
    -- ATOMIC ROW-LEVEL LOCK
    SELECT 
        user_id, 
        currency, 
        status, 
        metadata,
        COALESCE(reference_id, provider_reference, id::text),
        provider
    FROM public.transactions 
    WHERE id = p_transaction_id 
    FOR UPDATE
    INTO v_user_id, v_currency, v_status, v_metadata, v_idempotency_key, v_provider;

    -- 1. FINALIZED GUARD
    IF v_status IN ('COMPLETED', 'SUCCESS') THEN
        RETURN;
    END IF;

    -- 2. STATE TRANSITION GUARD
    IF v_status NOT IN ('PENDING', 'PROCESSING', 'FAILED') THEN
        RETURN;
    END IF;

    IF v_status = 'FAILED' AND NOT p_override THEN
        RETURN;
    END IF;

    -- IDEMPOTENCY CHECK (v6 Ledger)
    SELECT id INTO v_v6_tx_id FROM public.ledger_transactions_v6 WHERE idempotency_key::text = v_idempotency_key::text;

    IF v_v6_tx_id IS NOT NULL THEN
        UPDATE public.transactions 
        SET status = 'COMPLETED',
            external_hash = COALESCE(p_external_hash, external_hash),
            completed_at = NOW(),
            updated_at = NOW(),
            metadata = COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
                'journaled', true, 
                'v6_sync', NOW(),
                'settlement_status', 'SETTLED'
            )
        WHERE id = p_transaction_id;
        RETURN;
    END IF;

    -- 3. RESOLVE PROVIDER SETTLEMENT LEDGER ADDRESS
    v_sys_address := 'SETTLEMENT_' || UPPER(COALESCE(v_provider, 'PAYSTACK')) || '_' || v_currency;
    SELECT id INTO v_sys_wallet_id FROM public.wallets_store WHERE address = v_sys_address LIMIT 1;
    
    IF v_sys_wallet_id IS NULL THEN
        -- Fallback to PAYSTACK if specific provider is missing
        v_sys_address := 'SETTLEMENT_PAYSTACK_' || v_currency;
        SELECT id INTO v_sys_wallet_id FROM public.wallets_store WHERE address = v_sys_address LIMIT 1;
        
        -- Auto-provision if fallback also doesn't exist
        IF v_sys_wallet_id IS NULL THEN
            INSERT INTO public.wallets_store (user_id, currency, address, provider, network)
            VALUES ('00000000-0000-0000-0000-000000000000'::UUID, v_currency, v_sys_address, 'internal', 'INTERNAL')
            RETURNING id INTO v_sys_wallet_id;
        END IF;
    END IF;

    -- 4. LEDGER MATERIALIZATION (v6 Journaled)
    v_entries := jsonb_build_array(
        jsonb_build_object(
            'wallet_id', p_wallet_id,
            'user_id', v_user_id,
            'currency', v_currency,
            'amount', p_amount,
            'side', 'CREDIT'
        ),
        jsonb_build_object(
            'wallet_id', v_sys_wallet_id,
            'user_id', '00000000-0000-0000-0000-000000000000'::UUID,
            'currency', v_currency,
            'amount', -p_amount,
            'side', 'DEBIT'
        )
    );

    PERFORM public.execute_ledger_transaction_v6(
        v_idempotency_key::text, 
        'DEPOSIT',
        'SETTLED',
        COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
            'external_hash', p_external_hash,
            'rpc_call', 'confirm_deposit',
            'overridden', p_override,
            'settlement_ledger', v_sys_address
        ),
        v_entries
    );

    -- 5. UPDATE LEGACY TRANSACTION RECORD
    UPDATE public.transactions 
    SET status = 'COMPLETED',
        external_hash = COALESCE(p_external_hash, external_hash),
        completed_at = NOW(),
        updated_at = NOW(),
        metadata = COALESCE(v_metadata, '{}'::jsonb) || jsonb_build_object(
            'journaled', true, 
            'v6_sync', NOW(),
            'settlement_status', 'SETTLED'
        )
    WHERE id = p_transaction_id;

END;
$function$;

COMMIT;

