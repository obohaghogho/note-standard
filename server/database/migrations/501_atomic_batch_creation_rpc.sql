-- ============================================================================
-- Migration 501: NoteStandard Atomic Bulk Batch Creation RPC
-- ============================================================================
-- Purpose:
--   Provide a single atomic PostgreSQL function for creating payout_batches +
--   all payout_batch_items in ONE transaction, eliminating any possibility of
--   an orphaned batch header or partial child set.
--
-- This is METADATA-ONLY. No ledger entries. No wallet mutations.
--
-- Safety invariants:
--   - Does NOT modify execute_bulk_internal_transfer_v1
--   - Does NOT modify ledger_transactions_v6 or ledger_entries_v6
--   - Does NOT call any provider code
--   - Does NOT modify wallets_store balances
--   - SECURITY DEFINER, service_role ONLY
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_payout_batch_atomic_v1(
    p_batch_reference    TEXT,
    p_created_by         UUID,
    p_source_wallet_id   UUID,
    p_currency           TEXT,
    p_total_amount       NUMERIC,
    p_recipient_count    INTEGER,
    p_idempotency_key    TEXT,
    p_items              JSONB  -- Array of {recipient_user_id, recipient_wallet_id, amount, currency, item_index}
) RETURNS JSONB AS $$
DECLARE
    v_batch_id  UUID;
    v_item      JSONB;
    v_item_idx  INTEGER;
BEGIN
    -- Validate items array
    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_ITEMS: p_items must be a non-empty JSON array';
    END IF;

    IF jsonb_array_length(p_items) != p_recipient_count THEN
        RAISE EXCEPTION 'ITEM_COUNT_MISMATCH: p_recipient_count % does not match p_items length %',
            p_recipient_count, jsonb_array_length(p_items);
    END IF;

    -- Insert batch header
    INSERT INTO public.payout_batches (
        batch_reference,
        created_by,
        source_wallet_id,
        currency,
        total_amount,
        recipient_count,
        status,
        idempotency_key
    ) VALUES (
        p_batch_reference,
        p_created_by,
        p_source_wallet_id,
        UPPER(p_currency),
        p_total_amount,
        p_recipient_count,
        'PENDING_APPROVAL',
        p_idempotency_key
    )
    RETURNING id INTO v_batch_id;

    -- Insert all child items atomically in the same transaction
    v_item_idx := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.payout_batch_items (
            batch_id,
            recipient_user_id,
            recipient_wallet_id,
            amount,
            currency,
            item_index,
            status
        ) VALUES (
            v_batch_id,
            (v_item->>'recipient_user_id')::UUID,
            (v_item->>'recipient_wallet_id')::UUID,
            (v_item->>'amount')::NUMERIC,
            UPPER(v_item->>'currency'),
            (v_item->>'item_index')::INTEGER,
            'PENDING'
        );
        v_item_idx := v_item_idx + 1;
    END LOOP;

    -- Return batch id and confirmation
    RETURN jsonb_build_object(
        'batch_id',        v_batch_id,
        'item_count',      v_item_idx,
        'status',          'PENDING_APPROVAL',
        'idempotency_key', p_idempotency_key
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Privilege hardening
REVOKE EXECUTE ON FUNCTION public.create_payout_batch_atomic_v1(TEXT, UUID, UUID, TEXT, NUMERIC, INTEGER, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_payout_batch_atomic_v1(TEXT, UUID, UUID, TEXT, NUMERIC, INTEGER, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_payout_batch_atomic_v1(TEXT, UUID, UUID, TEXT, NUMERIC, INTEGER, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_payout_batch_atomic_v1(TEXT, UUID, UUID, TEXT, NUMERIC, INTEGER, TEXT, JSONB) TO service_role;

COMMIT;
