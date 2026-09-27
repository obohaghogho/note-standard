-- ============================================================================
-- Migration 500: NoteStandard Internal Bulk Payment Architecture (Hardened & Bound)
-- ============================================================================
-- Purpose:
--   1. Create parent metadata table public.payout_batches
--   2. Create child detail table public.payout_batch_items
--   3. Create required performance & idempotency indexes
--   4. Implement dedicated PL/pgSQL RPC public.execute_bulk_internal_transfer_v1
--      with explicit source-wallet & batch-item FOR UPDATE row-locking, authoritative
--      recipient wallet ownership validation, batch-idempotency binding, exact
--      batch item content matching, approval gate enforcement, strict source
--      wallet & currency binding, and in-transaction balance validation against
--      public.ledger_entries_v6.
--   5. Enforce strict SECURITY DEFINER privilege grants (service_role only).
--
-- Safety Invariants:
--   - Does NOT modify existing execute_ledger_transaction_v6 RPC.
--   - Does NOT modify existing 1-to-1 transfer logic (TransferService.js).
--   - Does NOT touch Grey, Fincra, Paystack, Anchor or external provider logic.
--   - Enforces 100% atomic journal commit (1 Debit + N Credits) or 100% rollback.
--   - Enforces SECURITY DEFINER with explicit search_path = public, pg_temp.
-- ============================================================================

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PARENT METADATA TABLE: payout_batches
CREATE TABLE IF NOT EXISTS public.payout_batches (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_reference        VARCHAR(64) UNIQUE NOT NULL,
    created_by             UUID NOT NULL REFERENCES public.profiles(id),
    approved_by            UUID REFERENCES public.profiles(id),
    source_wallet_id       UUID NOT NULL REFERENCES public.wallets_store(id),
    currency               VARCHAR(10) NOT NULL,
    total_amount           NUMERIC(30,18) NOT NULL CHECK (total_amount > 0),
    recipient_count        INTEGER NOT NULL CHECK (recipient_count > 0),
    status                 VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL' 
                           CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    idempotency_key        TEXT UNIQUE NOT NULL,
    ledger_transaction_id  UUID REFERENCES public.ledger_transactions_v6(id),
    failure_reason         TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at            TIMESTAMPTZ,
    completed_at           TIMESTAMPTZ,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_ref ON public.payout_batches(batch_reference);
CREATE INDEX IF NOT EXISTS idx_payout_batches_idempotency ON public.payout_batches(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payout_batches_creator ON public.payout_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON public.payout_batches(status);

-- 3. CHILD DETAIL TABLE: payout_batch_items
CREATE TABLE IF NOT EXISTS public.payout_batch_items (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id               UUID NOT NULL REFERENCES public.payout_batches(id) ON DELETE CASCADE,
    recipient_user_id      UUID NOT NULL REFERENCES public.profiles(id),
    recipient_wallet_id    UUID NOT NULL REFERENCES public.wallets_store(id),
    amount                 NUMERIC(30,18) NOT NULL CHECK (amount > 0),
    currency               VARCHAR(10) NOT NULL,
    item_index             INTEGER NOT NULL,
    status                 VARCHAR(32) NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED', 'REVERSED')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Invariant: Prevent duplicate recipient in the same batch
    CONSTRAINT uk_batch_recipient UNIQUE (batch_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_batch_items_batch ON public.payout_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_payout_batch_items_recipient ON public.payout_batch_items(recipient_user_id);

-- 4. DEDICATED ATOMIC BULK TRANSFER RPC
CREATE OR REPLACE FUNCTION public.execute_bulk_internal_transfer_v1(
    p_batch_id          UUID,
    p_idempotency_key   TEXT,
    p_source_wallet_id  UUID,
    p_entries           JSONB -- Array of {recipient_user_id, recipient_wallet_id, currency, amount, item_index}
) RETURNS UUID AS $$
DECLARE
    v_tx_id                   UUID;
    v_tx_metadata             JSONB;
    v_existing_batch_id       UUID;
    v_batch_status            VARCHAR(32);
    v_approved_by             UUID;
    v_approved_at             TIMESTAMPTZ;
    v_batch_source_wallet_id  UUID;
    v_batch_idempotency_key   TEXT;
    v_batch_currency          VARCHAR(10);
    v_item_count              INTEGER;
    v_item                    RECORD;
    v_source_user_id          UUID;
    v_source_currency         VARCHAR(10);
    v_source_is_frozen        BOOLEAN;
    v_current_balance         NUMERIC(30,18);
    v_computed_total          NUMERIC(30,18) := 0;
    v_entry                   JSONB;
    v_item_amount             NUMERIC(30,18);
    v_item_currency           VARCHAR(10);
    v_recip_wallet_id         UUID;
    v_recip_user_id           UUID;
    v_actual_owner_id         UUID;
    v_recip_is_frozen         BOOLEAN;
    v_ledger_entries          JSONB := '[]'::jsonb;
BEGIN
    -- 1. Lock and verify payout_batches parent record existence, bindings, approval state & approval metadata
    SELECT status, approved_by, approved_at, source_wallet_id, idempotency_key, currency 
    INTO v_batch_status, v_approved_by, v_approved_at, v_batch_source_wallet_id, v_batch_idempotency_key, v_batch_currency
    FROM public.payout_batches
    WHERE id = p_batch_id
    FOR UPDATE;

    IF v_batch_status IS NULL THEN
        RAISE EXCEPTION 'BATCH_NOT_FOUND: Payout batch % does not exist', p_batch_id;
    END IF;

    -- BINDING CHECK 1: Verify requested p_source_wallet_id matches persisted batch source_wallet_id
    IF v_batch_source_wallet_id != p_source_wallet_id THEN
        RAISE EXCEPTION 'BATCH_SOURCE_WALLET_MISMATCH: Requested source wallet % does not match persisted batch source wallet % for batch %', p_source_wallet_id, v_batch_source_wallet_id, p_batch_id;
    END IF;

    -- BINDING CHECK 2: Verify requested p_idempotency_key matches persisted batch idempotency_key
    IF v_batch_idempotency_key != p_idempotency_key THEN
        RAISE EXCEPTION 'BATCH_IDEMPOTENCY_KEY_MISMATCH: Requested idempotency key % does not match persisted batch idempotency key % for batch %', p_idempotency_key, v_batch_idempotency_key, p_batch_id;
    END IF;

    IF v_batch_status = 'COMPLETED' THEN
        SELECT ledger_transaction_id INTO v_tx_id FROM public.payout_batches WHERE id = p_batch_id;
        IF v_tx_id IS NOT NULL THEN
            RETURN v_tx_id;
        END IF;
    END IF;

    -- APPROVAL GATE: PENDING_APPROVAL, DRAFT, FAILED, CANCELLED cannot execute
    IF v_batch_status NOT IN ('APPROVED', 'EXECUTING') THEN
        RAISE EXCEPTION 'APPROVAL_GATE_VIOLATION: Batch % in status % cannot execute financially. Approval is required.', p_batch_id, v_batch_status;
    END IF;

    IF (v_batch_status = 'APPROVED' OR v_batch_status = 'EXECUTING') AND (v_approved_by IS NULL OR v_approved_at IS NULL) THEN
        RAISE EXCEPTION 'APPROVAL_METADATA_MISSING: Batch % status is % but lacks approved_by or approved_at timestamp.', p_batch_id, v_batch_status;
    END IF;

    -- 2. Idempotency Check on Header with Strict Batch-ID Binding Verification
    SELECT id, metadata INTO v_tx_id, v_tx_metadata 
    FROM public.ledger_transactions_v6 
    WHERE idempotency_key = p_idempotency_key;

    IF v_tx_id IS NOT NULL THEN
        v_existing_batch_id := (v_tx_metadata->>'batch_id')::UUID;
        IF v_existing_batch_id IS NOT NULL AND v_existing_batch_id != p_batch_id THEN
            RAISE EXCEPTION 'IDEMPOTENCY_BATCH_MISMATCH: Idempotency key % belongs to batch %, not %', p_idempotency_key, v_existing_batch_id, p_batch_id;
        END IF;

        UPDATE public.payout_batches 
        SET status = 'COMPLETED', ledger_transaction_id = v_tx_id, completed_at = NOW() 
        WHERE id = p_batch_id AND status != 'COMPLETED';

        RETURN v_tx_id;
    END IF;

    -- 3. Field-for-Field Exact Match Verification & Child-Row Lock (FOR UPDATE)
    SELECT COUNT(*) INTO v_item_count 
    FROM public.payout_batch_items 
    WHERE batch_id = p_batch_id;

    IF v_item_count = 0 THEN
        RAISE EXCEPTION 'BATCH_ITEM_CONTENT_MISMATCH: Batch % has no registered batch items in database', p_batch_id;
    END IF;

    IF p_entries IS NULL OR jsonb_typeof(p_entries) != 'array' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Payment entries payload p_entries must be a valid JSON array for batch %', p_batch_id;
    END IF;

    IF v_item_count != jsonb_array_length(p_entries) THEN
        RAISE EXCEPTION 'BATCH_ITEM_CONTENT_MISMATCH: Batch % has % registered items in database, but received % payment entries in payload', p_batch_id, v_item_count, jsonb_array_length(p_entries);
    END IF;

    -- Lock child batch items FOR UPDATE and verify field-for-field exact match
    FOR v_item IN 
        SELECT item_index, recipient_user_id, recipient_wallet_id, amount, currency 
        FROM public.payout_batch_items 
        WHERE batch_id = p_batch_id 
        ORDER BY item_index ASC
        FOR UPDATE
    LOOP
        -- Find matching entry by recipient_user_id AND item_index in p_entries
        SELECT elem INTO v_entry 
        FROM jsonb_array_elements(p_entries) AS elem 
        WHERE (elem->>'recipient_user_id')::UUID = v_item.recipient_user_id 
          AND (elem->>'item_index') IS NOT NULL 
          AND (elem->>'item_index')::INTEGER = v_item.item_index
        LIMIT 1;

        IF v_entry IS NULL THEN
            RAISE EXCEPTION 'BATCH_ITEM_CONTENT_MISMATCH: Batch % registered item index % (recipient %) not found in execution payload', p_batch_id, v_item.item_index, v_item.recipient_user_id;
        END IF;

        IF (v_entry->>'recipient_wallet_id')::UUID != v_item.recipient_wallet_id THEN
            RAISE EXCEPTION 'BATCH_ITEM_CONTENT_MISMATCH: Batch % recipient % wallet mismatch (persisted %, payload %)', p_batch_id, v_item.recipient_user_id, v_item.recipient_wallet_id, (v_entry->>'recipient_wallet_id')::UUID;
        END IF;

        IF UPPER(v_entry->>'currency') != UPPER(v_item.currency) THEN
            RAISE EXCEPTION 'BATCH_ITEM_CONTENT_MISMATCH: Batch % recipient % currency mismatch (persisted %, payload %)', p_batch_id, v_item.recipient_user_id, UPPER(v_item.currency), UPPER(v_entry->>'currency');
        END IF;

        IF UPPER(v_item.currency) != UPPER(v_batch_currency) THEN
            RAISE EXCEPTION 'BATCH_ITEM_CURRENCY_MISMATCH: Batch item % currency % does not match persisted batch currency % for batch %', v_item.item_index, UPPER(v_item.currency), UPPER(v_batch_currency), p_batch_id;
        END IF;

        IF (v_entry->>'amount')::NUMERIC != v_item.amount THEN
            RAISE EXCEPTION 'BATCH_ITEM_CONTENT_MISMATCH: Batch % recipient % amount mismatch (persisted %, payload %)', p_batch_id, v_item.recipient_user_id, v_item.amount, (v_entry->>'amount')::NUMERIC;
        END IF;
    END LOOP;

    -- 4. Source Wallet Row Lock in wallets_store (FOR UPDATE)
    SELECT user_id, currency, is_frozen 
    INTO v_source_user_id, v_source_currency, v_source_is_frozen
    FROM public.wallets_store
    WHERE id = p_source_wallet_id
    FOR UPDATE;

    IF v_source_user_id IS NULL THEN
        RAISE EXCEPTION 'SOURCE_WALLET_NOT_FOUND: Wallet % does not exist', p_source_wallet_id;
    END IF;

    IF UPPER(v_source_currency) != UPPER(v_batch_currency) THEN
        RAISE EXCEPTION 'BATCH_CURRENCY_MISMATCH: Source wallet currency % does not match persisted batch currency % for batch %', UPPER(v_source_currency), UPPER(v_batch_currency), p_batch_id;
    END IF;

    IF v_source_is_frozen THEN
        RAISE EXCEPTION 'SOURCE_WALLET_FROZEN: Wallet % is frozen', p_source_wallet_id;
    END IF;

    -- Calculate Authoritative Available Balance from Journal while holding row lock
    SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
    FROM public.ledger_entries_v6
    WHERE wallet_id = p_source_wallet_id;

    -- 5. Loop & Validate Recipient Entries from Locked Authoritative Persisted Items (FOR UPDATE)
    FOR v_item IN 
        SELECT item_index, recipient_user_id, recipient_wallet_id, amount, currency 
        FROM public.payout_batch_items 
        WHERE batch_id = p_batch_id 
        ORDER BY item_index ASC
        FOR UPDATE
    LOOP
        v_recip_wallet_id := v_item.recipient_wallet_id;
        v_recip_user_id   := v_item.recipient_user_id;
        v_item_amount     := v_item.amount;
        v_item_currency   := UPPER(v_item.currency);

        -- Self-Payment Check
        IF v_recip_wallet_id = p_source_wallet_id OR v_recip_user_id = v_source_user_id THEN
            RAISE EXCEPTION 'SELF_PAYMENT_FORBIDDEN: Recipient wallet % matches source wallet', v_recip_wallet_id;
        END IF;

        -- Currency Alignment Check
        IF v_item_currency != v_source_currency THEN
            RAISE EXCEPTION 'CURRENCY_MISMATCH: Item currency % does not match source wallet currency %', v_item_currency, v_source_currency;
        END IF;

        -- Amount Check
        IF v_item_amount <= 0 OR v_item_amount IS NULL THEN
            RAISE EXCEPTION 'INVALID_AMOUNT: Recipient % amount % must be > 0', v_recip_user_id, v_item_amount;
        END IF;

        -- Validate Recipient Wallet Exists & Verify Authoritative Wallet Ownership
        SELECT user_id, is_frozen INTO v_actual_owner_id, v_recip_is_frozen 
        FROM public.wallets_store 
        WHERE id = v_recip_wallet_id AND currency = v_item_currency;

        IF v_actual_owner_id IS NULL THEN
            RAISE EXCEPTION 'RECIPIENT_WALLET_NOT_FOUND: Wallet % does not exist for currency %', v_recip_wallet_id, v_item_currency;
        END IF;

        IF v_actual_owner_id != v_recip_user_id THEN
            RAISE EXCEPTION 'RECIPIENT_OWNERSHIP_MISMATCH: Wallet % belongs to user %, not %', v_recip_wallet_id, v_actual_owner_id, v_recip_user_id;
        END IF;

        IF v_recip_is_frozen THEN
            RAISE EXCEPTION 'RECIPIENT_WALLET_FROZEN: Wallet % is frozen', v_recip_wallet_id;
        END IF;

        -- Accumulate Total Amount
        v_computed_total := v_computed_total + v_item_amount;

        -- Append Credit Entry to JSON Array
        v_ledger_entries := v_ledger_entries || jsonb_build_object(
            'wallet_id', v_recip_wallet_id,
            'user_id', v_recip_user_id,
            'currency', v_item_currency,
            'amount', v_item_amount,
            'side', 'CREDIT'
        );
    END LOOP;

    -- Authoritative Balance Verification
    IF v_current_balance < v_computed_total THEN
        RAISE EXCEPTION 'INSUFFICIENT_SOURCE_BALANCE: Available %, Required %', v_current_balance, v_computed_total;
    END IF;

    -- Prepend Source Wallet DEBIT Entry (-v_computed_total)
    v_ledger_entries := jsonb_build_array(
        jsonb_build_object(
            'wallet_id', p_source_wallet_id,
            'user_id', v_source_user_id,
            'currency', v_source_currency,
            'amount', -v_computed_total,
            'side', 'DEBIT'
        )
    ) || v_ledger_entries;

    -- Insert Transaction Header in ledger_transactions_v6
    INSERT INTO public.ledger_transactions_v6 (idempotency_key, type, status, metadata)
    VALUES (
        p_idempotency_key, 
        'BULK_INTERNAL_TRANSFER', 
        'SETTLED', 
        jsonb_build_object('batch_id', p_batch_id, 'total_amount', v_computed_total, 'item_count', v_item_count)
    )
    RETURNING id INTO v_tx_id;

    -- Insert All Ledger Entries (1 Debit + N Credits) into ledger_entries_v6
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_ledger_entries)
    LOOP
        INSERT INTO public.ledger_entries_v6 (transaction_id, wallet_id, user_id, currency, amount, side)
        VALUES (
            v_tx_id, 
            (v_entry->>'wallet_id')::UUID, 
            (v_entry->>'user_id')::UUID, 
            v_entry->>'currency', 
            (v_entry->>'amount')::NUMERIC, 
            v_entry->>'side'
        );
    END LOOP;

    -- Update Batch Metadata Status to COMPLETED
    UPDATE public.payout_batches
    SET status = 'COMPLETED',
        ledger_transaction_id = v_tx_id,
        total_amount = v_computed_total,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_batch_id;

    -- Update Batch Child Items Status to SUCCESSFUL
    UPDATE public.payout_batch_items
    SET status = 'SUCCESSFUL'
    WHERE batch_id = p_batch_id;

    -- Deferred trigger 'trg_v6_ledger_integrity' will automatically validate Σ = 0 at commit.

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- PRIVILEGE HARDENING FOR SECURITY DEFINER RPC
REVOKE EXECUTE ON FUNCTION public.execute_bulk_internal_transfer_v1(UUID, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_bulk_internal_transfer_v1(UUID, TEXT, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_bulk_internal_transfer_v1(UUID, TEXT, UUID, JSONB) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.execute_bulk_internal_transfer_v1(UUID, TEXT, UUID, JSONB) TO service_role;

COMMIT;
