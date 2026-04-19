-- ============================================================================
-- Migration 166: Sovereign Settlement RPC
-- ============================================================================
-- Purpose:
--   1. Implement the Atomic Transaction Boundary for Settlement.
--   2. Handle row-level locking (FOR UPDATE) to prevent race conditions.
--   3. Synchronously commit ledger entries when terminal finality is achieved.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_settlement_v6(
    p_transaction_id    UUID,
    p_target_status     execution_status_v6,
    p_provider_id       TEXT,
    p_payload_hash      TEXT,
    p_provider_event_at TIMESTAMPTZ,
    p_ingested_at       TIMESTAMPTZ,
    p_confidence        NUMERIC
) RETURNS JSONB AS $$
DECLARE
    v_tx RECORD;
    v_entry JSONB;
    v_target_rank INT;
    v_current_rank INT;
    v_state_map JSONB := '{
        "INITIATED": 1, 
        "PROVIDER_SOFT": 2, 
        "PROVIDER_HARD": 3, 
        "LEDGER_COMMITTED": 4, 
        "FAILED": 5, 
        "COMPENSATED": 6
    }'::jsonb;
BEGIN
    -- 1. Acquire Sovereign Row Lock
    SELECT * INTO v_tx 
    FROM public.ledger_transactions_v6 
    WHERE id = p_transaction_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TX_NOT_FOUND: %', p_transaction_id;
    END IF;

    -- 2. Post-Lock Revalidation (Check if state advanced while waiting)
    v_current_rank := (v_state_map->>(v_tx.execution_status::text))::int;
    v_target_rank := (v_state_map->>(p_target_status::text))::int;

    -- If we've already reached or exceeded the target state, return NOOP success
    IF v_current_rank >= v_target_rank THEN
        RETURN jsonb_build_object('success', true, 'noop', true, 'reason', 'STATE_ALREADY_ADVANCED');
    END IF;

    -- 3. Invariant: TERMINAL_SINK (Cannot move out of LEDGER_COMMITTED)
    IF v_tx.execution_status = 'LEDGER_COMMITTED' THEN
        RETURN jsonb_build_object('success', true, 'noop', true, 'reason', 'TERMINAL_SINK_PROTECTION');
    END IF;

    -- 4. Monotonic Temporal Guard
    IF v_tx.last_ingested_at IS NOT NULL AND p_ingested_at < v_tx.last_ingested_at THEN
        RAISE EXCEPTION 'TEMPORAL_REGRESSION: Ingested time % is older than current %', p_ingested_at, v_tx.last_ingested_at;
    END IF;

    -- 5. Update State
    UPDATE public.ledger_transactions_v6
    SET execution_status = p_target_status,
        finality_confidence = p_confidence,
        provider_id = COALESCE(v_tx.provider_id, p_provider_id),
        provider_event_at = p_provider_event_at,
        last_ingested_at = p_ingested_at,
        payload_hash = p_payload_hash,
        updated_at = NOW()
    WHERE id = p_transaction_id;

    -- 6. Synchronous Ledger Commitment (Terminal Path)
    IF p_target_status = 'LEDGER_COMMITTED' THEN
        -- Verify intent_entries exists
        IF v_tx.intent_entries IS NULL OR jsonb_array_length(v_tx.intent_entries) = 0 THEN
            RAISE EXCEPTION 'INCOMPLE_INTENT: Cannot commit settlement without entries for TX %', p_transaction_id;
        END IF;

        -- Insert entries
        FOR v_entry IN SELECT * FROM jsonb_array_elements(v_tx.intent_entries)
        LOOP
            INSERT INTO public.ledger_entries_v6 (transaction_id, wallet_id, user_id, currency, amount, side)
            VALUES (
                p_transaction_id, 
                (v_entry->>'wallet_id')::UUID, 
                (v_entry->>'user_id')::UUID, 
                v_entry->>'currency', 
                (v_entry->>'amount')::NUMERIC, 
                v_entry->>'side'
            );
        END LOOP;
        
        -- Journal Integrity Sentinel trigger 'trg_v6_ledger_integrity' will balance check here
        -- Epoch Increment trigger will fire on terminal status
    END IF;

    RETURN jsonb_build_object('success', true, 'tx_id', p_transaction_id, 'status', p_target_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
