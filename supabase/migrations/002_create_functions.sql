-- ============================================================================
-- NoteStandard Payment Platform — Database Migration 002
-- Atomic PostgreSQL functions for wallet operations
-- ============================================================================

-- 1. Credit Wallet (idempotent)
CREATE OR REPLACE FUNCTION credit_wallet(
    p_wallet_id UUID,
    p_amount BIGINT,
    p_currency VARCHAR,
    p_reference VARCHAR,
    p_category VARCHAR,
    p_description TEXT DEFAULT NULL,
    p_provider VARCHAR DEFAULT NULL,
    p_provider_reference VARCHAR DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_balance BIGINT;
    v_entry_id UUID;
BEGIN
    SELECT balance INTO v_balance
    FROM wallets WHERE id = p_wallet_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    -- Idempotency: return existing entry if reference already processed
    SELECT id INTO v_entry_id FROM ledger_entries WHERE reference = p_reference;
    IF FOUND THEN
        RETURN v_entry_id;
    END IF;

    INSERT INTO ledger_entries (
        wallet_id, type, amount, currency, balance_before, balance_after,
        status, category, description, reference, provider, provider_reference, metadata
    ) VALUES (
        p_wallet_id, 'credit', p_amount, p_currency, v_balance,
        v_balance + p_amount, 'completed', p_category, p_description,
        p_reference, p_provider, p_provider_reference, p_metadata
    ) RETURNING id INTO v_entry_id;

    UPDATE wallets SET
        balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        updated_at = now()
    WHERE id = p_wallet_id;

    RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Debit Wallet (idempotent)
CREATE OR REPLACE FUNCTION debit_wallet(
    p_wallet_id UUID,
    p_amount BIGINT,
    p_currency VARCHAR,
    p_reference VARCHAR,
    p_category VARCHAR,
    p_description TEXT DEFAULT NULL,
    p_provider VARCHAR DEFAULT NULL,
    p_provider_reference VARCHAR DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_balance BIGINT;
    v_available BIGINT;
    v_entry_id UUID;
BEGIN
    SELECT balance, available_balance INTO v_balance, v_available
    FROM wallets WHERE id = p_wallet_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    SELECT id INTO v_entry_id FROM ledger_entries WHERE reference = p_reference;
    IF FOUND THEN
        RETURN v_entry_id;
    END IF;

    IF v_available < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance. Available: %, Requested: %', v_available, p_amount;
    END IF;

    INSERT INTO ledger_entries (
        wallet_id, type, amount, currency, balance_before, balance_after,
        status, category, description, reference, provider, provider_reference, metadata
    ) VALUES (
        p_wallet_id, 'debit', p_amount, p_currency, v_balance,
        v_balance - p_amount, 'completed', p_category, p_description,
        p_reference, p_provider, p_provider_reference, p_metadata
    ) RETURNING id INTO v_entry_id;

    UPDATE wallets SET
        balance = balance - p_amount,
        available_balance = available_balance - p_amount,
        updated_at = now()
    WHERE id = p_wallet_id;

    RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Reserve Wallet Funds (available → reserved)
CREATE OR REPLACE FUNCTION reserve_wallet_funds(
    p_wallet_id UUID,
    p_amount BIGINT,
    p_currency VARCHAR,
    p_reference VARCHAR,
    p_type VARCHAR,
    p_expires_at TIMESTAMPTZ,
    p_related_entity_type VARCHAR DEFAULT NULL,
    p_related_entity_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_available BIGINT;
    v_reservation_id UUID;
BEGIN
    SELECT available_balance INTO v_available
    FROM wallets WHERE id = p_wallet_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    IF v_available < p_amount THEN
        RAISE EXCEPTION 'Insufficient available balance for reservation. Available: %, Requested: %', v_available, p_amount;
    END IF;

    INSERT INTO wallet_reservations (
        wallet_id, amount, currency, type, reference, expires_at,
        related_entity_type, related_entity_id, metadata
    ) VALUES (
        p_wallet_id, p_amount, p_currency, p_type, p_reference, p_expires_at,
        p_related_entity_type, p_related_entity_id, p_metadata
    ) RETURNING id INTO v_reservation_id;

    UPDATE wallets SET
        available_balance = available_balance - p_amount,
        reserved_balance = reserved_balance + p_amount,
        updated_at = now()
    WHERE id = p_wallet_id;

    RETURN v_reservation_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Capture Reservation (reserved → locked)
CREATE OR REPLACE FUNCTION capture_reservation(p_reservation_id UUID) RETURNS VOID AS $$
DECLARE
    v_reservation wallet_reservations%ROWTYPE;
BEGIN
    SELECT * INTO v_reservation
    FROM wallet_reservations
    WHERE id = p_reservation_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active reservation not found: %', p_reservation_id;
    END IF;

    UPDATE wallet_reservations
    SET status = 'captured', captured_at = now(), updated_at = now()
    WHERE id = p_reservation_id;

    UPDATE wallets SET
        reserved_balance = reserved_balance - v_reservation.amount,
        locked_balance = locked_balance + v_reservation.amount,
        updated_at = now()
    WHERE id = v_reservation.wallet_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Release Reservation (reserved → available)
CREATE OR REPLACE FUNCTION release_reservation(p_reservation_id UUID) RETURNS VOID AS $$
DECLARE
    v_reservation wallet_reservations%ROWTYPE;
BEGIN
    SELECT * INTO v_reservation
    FROM wallet_reservations
    WHERE id = p_reservation_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active reservation not found: %', p_reservation_id;
    END IF;

    UPDATE wallet_reservations
    SET status = 'released', released_at = now(), updated_at = now()
    WHERE id = p_reservation_id;

    UPDATE wallets SET
        reserved_balance = reserved_balance - v_reservation.amount,
        available_balance = available_balance + v_reservation.amount,
        updated_at = now()
    WHERE id = v_reservation.wallet_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Lock Wallet Funds (available → locked, direct lock without reservation)
CREATE OR REPLACE FUNCTION lock_wallet_funds(
    p_wallet_id UUID,
    p_amount BIGINT
) RETURNS VOID AS $$
DECLARE
    v_available BIGINT;
BEGIN
    SELECT available_balance INTO v_available
    FROM wallets WHERE id = p_wallet_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    IF v_available < p_amount THEN
        RAISE EXCEPTION 'Insufficient available balance for lock. Available: %, Requested: %', v_available, p_amount;
    END IF;

    UPDATE wallets SET
        available_balance = available_balance - p_amount,
        locked_balance = locked_balance + p_amount,
        updated_at = now()
    WHERE id = p_wallet_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Unlock Wallet Funds (locked → available)
CREATE OR REPLACE FUNCTION unlock_wallet_funds(
    p_wallet_id UUID,
    p_amount BIGINT
) RETURNS VOID AS $$
BEGIN
    UPDATE wallets SET
        available_balance = available_balance + p_amount,
        locked_balance = locked_balance - p_amount,
        updated_at = now()
    WHERE id = p_wallet_id
    AND locked_balance >= p_amount;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot unlock: wallet not found or insufficient locked balance';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 8. Reconcile Wallet (verify balance integrity)
CREATE OR REPLACE FUNCTION reconcile_wallet(p_wallet_id UUID)
RETURNS TABLE(stored_balance BIGINT, computed_balance BIGINT, is_consistent BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.balance AS stored_balance,
        COALESCE(SUM(
            CASE
                WHEN le.type = 'credit' AND le.status = 'completed' THEN le.amount
                WHEN le.type = 'debit' AND le.status = 'completed' THEN -le.amount
                ELSE 0
            END
        ), 0)::BIGINT AS computed_balance,
        w.balance = COALESCE(SUM(
            CASE
                WHEN le.type = 'credit' AND le.status = 'completed' THEN le.amount
                WHEN le.type = 'debit' AND le.status = 'completed' THEN -le.amount
                ELSE 0
            END
        ), 0)::BIGINT AS is_consistent
    FROM wallets w
    LEFT JOIN ledger_entries le ON le.wallet_id = w.id
    WHERE w.id = p_wallet_id
    GROUP BY w.id, w.balance;
END;
$$ LANGUAGE plpgsql;

-- 9. Expire Stale Reservations
CREATE OR REPLACE FUNCTION expire_stale_reservations() RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_reservation RECORD;
BEGIN
    FOR v_reservation IN
        SELECT id, wallet_id, amount
        FROM wallet_reservations
        WHERE status = 'active' AND expires_at < now()
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE wallet_reservations
        SET status = 'expired', updated_at = now()
        WHERE id = v_reservation.id;

        UPDATE wallets SET
            reserved_balance = reserved_balance - v_reservation.amount,
            available_balance = available_balance + v_reservation.amount,
            updated_at = now()
        WHERE id = v_reservation.wallet_id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
