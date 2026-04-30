-- ============================================================================
-- Migration 184: Fix UUID Casting in Causal Mirror
-- ============================================================================
-- Purpose:
--   1. Replaces the hardcoded string fallback 'causal_XX' with a deterministic UUID
--      using MD5 hashing of the sequence_id, ensuring the idempotency_key is ALWAYS
--      a valid UUID for payout_requests.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.mirror_causal_to_ledger_v6_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_wallet_id UUID;
    v_user_id UUID;
    v_currency VARCHAR;
    v_amount NUMERIC;
    v_side TEXT;
    v_tx_type TEXT;
    v_entries JSONB;
    v_idempotency_key TEXT;
    v_tx_id UUID;
BEGIN
    -- Only process financial mutation events
    IF NEW.event_type NOT IN ('payout_create', 'payout_transition', 'ledger_mutation') THEN
        RETURN NEW;
    END IF;

    -- Extract common data
    v_wallet_id := NEW.entity_id;
    
    -- Extract or Generate a deterministic UUID if the payload key is missing
    v_idempotency_key := COALESCE(NEW.payload->>'client_idempotency_key', NEW.payload->>'idempotency_key');
    IF v_idempotency_key IS NULL THEN
        -- Generate a deterministic UUID from the string 'causal_' + sequence_id using MD5
        v_idempotency_key := md5('causal_' || NEW.sequence_id)::uuid::text;
    END IF;

    SELECT user_id, currency INTO v_user_id, v_currency FROM public.wallets_store WHERE id = v_wallet_id;

    IF v_user_id IS NULL THEN
        -- Fallback for system-level mutations
        v_user_id := (SELECT user_id FROM public.profiles LIMIT 1);
    END IF;

    IF NEW.event_type = 'payout_create' THEN
        v_amount := -(NEW.payload->>'amount')::NUMERIC;
        v_side := 'DEBIT';
        v_tx_type := 'WITHDRAWAL';
    ELSIF NEW.event_type = 'ledger_mutation' THEN
        v_amount := (NEW.payload->>'amount')::NUMERIC;
        v_tx_type := 'TRANSFER';
        IF NEW.payload->>'action' = 'DEBIT' THEN
            v_amount := -ABS(v_amount);
            v_side := 'DEBIT';
        ELSE
            v_side := 'CREDIT';
        END IF;
    ELSE
        -- ignore transitions that don't involve money directly here
        RETURN NEW;
    END IF;

    -- 1. Construct Journal Entries
    v_entries := jsonb_build_array(
        jsonb_build_object(
            'wallet_id', v_wallet_id,
            'user_id', v_user_id,
            'currency', v_currency,
            'amount', v_amount,
            'side', v_side
        ),
        jsonb_build_object(
            'wallet_id', (SELECT id FROM wallets_store WHERE address = 'SYSTEM_LP_' || v_currency LIMIT 1),
            'user_id', (SELECT user_id FROM wallets_store WHERE address = 'SYSTEM_LP_' || v_currency LIMIT 1),
            'currency', v_currency,
            'amount', -v_amount,
            'side', CASE WHEN v_side = 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END
        )
    );

    -- 2. Execute v6 Ledger Commit
    v_tx_id := public.execute_ledger_transaction_v6(
        v_idempotency_key,
        v_tx_type,
        CASE WHEN NEW.event_type = 'payout_create' THEN 'PENDING'::settlement_status_v6 ELSE 'SETTLED'::settlement_status_v6 END,
        jsonb_build_object('causal_sequence', NEW.sequence_id, 'causal_group_id', NEW.causal_group_id),
        v_entries
    );

    -- 3. MATERIALIZATION LAYER: Create Payout Request Record
    IF NEW.event_type = 'payout_create' THEN
        -- Ensure we don't create duplicate requests for the same intent
        INSERT INTO public.payout_requests (
            user_id,
            wallet_id,
            transaction_id,
            amount,
            fee,
            net_amount,
            currency,
            payout_method,
            destination,
            status,
            idempotency_key,
            metadata
        ) VALUES (
            v_user_id,
            v_wallet_id,
            v_tx_id,
            ABS(v_amount),
            0, -- TODO: Dynamic Fee Calculation
            ABS(v_amount),
            v_currency,
            NEW.payload->>'payout_method',
            NEW.payload->'destination',
            'approved', -- AUTO-APPROVE for testing/dev environments
            (v_idempotency_key)::UUID,
            NEW.payload
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$;

COMMIT;
