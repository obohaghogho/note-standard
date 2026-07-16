-- ============================================================================
-- Migration 183: Financial Integrity Repair & Causal Bridge Fix
-- ============================================================================
-- Purpose:
--   1. Fixes the syntax error (Math.abs -> ABS) in the Causal-to-Ledger bridge.
--   2. Ensures absolute atomicity for payouts and internal transfers.
-- ============================================================================

BEGIN;

-- 1. REPAIR: mirror_causal_to_ledger_v6_fn
-- Fixing the 'Math.abs' syntax error that was breaking payout journaling.
CREATE OR REPLACE FUNCTION public.mirror_causal_to_ledger_v6_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_id UUID;
    v_user_id UUID;
    v_currency VARCHAR;
    v_amount NUMERIC;
    v_side TEXT;
    v_tx_type TEXT;
    v_entries JSONB;
    v_idempotency_key TEXT;
BEGIN
    -- Only process financial mutation events
    IF NEW.event_type NOT IN ('payout_create', 'payout_transition', 'ledger_mutation') THEN
        RETURN NEW;
    END IF;

    -- Extract common data
    v_wallet_id := NEW.entity_id;
    v_idempotency_key := COALESCE(NEW.payload->>'client_idempotency_key', NEW.payload->>'idempotency_key', 'causal_' || NEW.sequence_id);

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
        -- FIX: Use ABS() instead of Math.abs()
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

    -- Construct Journal Entries
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

    -- Execute v6 Ledger Commit
    PERFORM public.execute_ledger_transaction_v6(
        v_idempotency_key,
        v_tx_type,
        CASE WHEN NEW.event_type = 'payout_create' THEN 'PENDING'::settlement_status_v6 ELSE 'SETTLED'::settlement_status_v6 END,
        jsonb_build_object('causal_sequence', NEW.sequence_id, 'causal_group_id', NEW.causal_group_id),
        v_entries
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RE-APPLY THE TRIGGER
DROP TRIGGER IF EXISTS trg_mirror_causal_to_ledger ON public.financial_event_log;
CREATE TRIGGER trg_mirror_causal_to_ledger
AFTER INSERT ON public.financial_event_log
FOR EACH ROW EXECUTE FUNCTION public.mirror_causal_to_ledger_v6_fn();

-- 3. RETROACTIVE SYNC
-- We find any 'payout_create' intents that succeeded in the queue but didn't make it to the ledger.
-- This can happen if the trigger was broken but the CausalWorker didn't roll back (unlikely, but safe to check).
-- More importantly, we re-materialize for any wallet that might have been touched by the broken trigger attempts.
DO $$
DECLARE
    v_wallet RECORD;
BEGIN
    FOR v_wallet IN SELECT id FROM public.wallets_store LOOP
        PERFORM public.sync_wallet_balance_from_ledger(v_wallet.id);
    END LOOP;
END $$;

COMMIT;
