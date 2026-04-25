-- ============================================================================
-- Migration 180: Bridging v5 Causal Engine to v6 Sovereign Ledger
-- ============================================================================
-- Purpose:
--   1. Automatically mirror causal events to the v6 Ledger.
--   2. Ensures internal transfers and payouts are captured in ledger_entries_v6.
--   3. Eliminates "off-ledger" balance changes that cause systemic drift.
-- ============================================================================

BEGIN;

-- 1. CAUSAL MIRROR FUNCTION
-- This function interprets v5 causal events and creates v6 journal entries.
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
    IF NEW.event_type NOT IN ('payout_create', 'ledger_mutation') THEN
        RETURN NEW;
    END IF;

    -- Extract common data
    v_wallet_id := NEW.entity_id;
    v_idempotency_key := COALESCE(NEW.payload->>'client_idempotency_key', NEW.payload->>'idempotency_key', 'causal_' || NEW.sequence_id);

    SELECT user_id, currency INTO v_user_id, v_currency FROM public.wallets_store WHERE id = v_wallet_id;

    IF NEW.event_type = 'payout_create' THEN
        v_amount := -(NEW.payload->>'amount')::NUMERIC;
        v_side := 'DEBIT';
        v_tx_type := 'WITHDRAWAL';
    ELSIF NEW.event_type = 'ledger_mutation' THEN
        v_amount := (NEW.payload->>'amount')::NUMERIC;
        v_tx_type := 'TRANSFER';
        IF NEW.payload->>'action' = 'DEBIT' THEN
            v_amount := -Math.abs(v_amount);
            v_side := 'DEBIT';
        ELSE
            v_side := 'CREDIT';
        END IF;
    END IF;

    -- Construct Journal Entries
    -- For v5 compatibility, we credit/debit against SYSTEM_LP
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

-- 2. APPLY TRIGGER
DROP TRIGGER IF EXISTS trg_mirror_causal_to_ledger ON financial_event_log;
CREATE TRIGGER trg_mirror_causal_to_ledger
AFTER INSERT ON financial_event_log
FOR EACH ROW EXECUTE FUNCTION public.mirror_causal_to_ledger_v6_fn();

COMMIT;
