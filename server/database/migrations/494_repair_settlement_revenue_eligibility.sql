-- =============================================================================
-- Migration 494: Repair settlement revenue eligibility calculation
-- =============================================================================
-- Purpose:
--   Update reserve_platform_revenue() RPC to enforce provider-backed revenue
--   eligibility rules. Prevents historical pre-493 test/internal revenue rows
--   from being counted towards available platform settlement ceiling.
--
-- Excluded:
--   - Pre-493 test withdrawal revenue rows (tx.provider IS NULL and no Fincra evidence)
--   - Unverified internal-reference revenue rows (tx.reference_id LIKE 'NS-%' or 'MANUAL-CREDIT-%')
--   - Unrelated customer principal / test credits
--   - Wrong currencies
--
-- Preserved:
--   - Verified Fincra direct revenue (tx.provider = 'fincra')
--   - Verified legacy Fincra evidence (metadata ILIKE '%fincra%')
--   - Verified Anchor revenue (tx.provider = 'anchor')
--   - Verified Grey revenue (tx.provider = 'grey')
--   - Currency isolation (NGN vs USD vs GHS)
--
-- Safety properties:
--   - CREATE OR REPLACE FUNCTION only — no table schema change
--   - No INSERT/UPDATE/DELETE on data tables
--   - Idempotency & concurrency locking preserved (FOR SHARE on revenue_logs, FOR UPDATE on platform_settlements)
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_platform_revenue(
    p_reference         VARCHAR,
    p_amount            NUMERIC,
    p_currency          VARCHAR,
    p_destination       VARCHAR,
    p_initiated_by      UUID,
    p_is_live           BOOLEAN,
    p_metadata          JSONB
)
RETURNS public.platform_settlements
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_revenue     NUMERIC := 0;
    v_total_reserved    NUMERIC := 0;
    v_available         NUMERIC := 0;
    v_record            public.platform_settlements;
    v_cur               VARCHAR := UPPER(p_currency);
    v_status            VARCHAR;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_SETTLEMENT_AMOUNT: Amount must be greater than zero.';
    END IF;

    -- Lock revenue_logs rows for this currency (prevents concurrent modification)
    PERFORM rl.id
    FROM public.revenue_logs rl
    WHERE rl.currency = v_cur
    FOR SHARE;

    -- Lock existing active platform_settlements for this currency
    -- (prevents a concurrent request from seeing stale available balance)
    PERFORM id
    FROM public.platform_settlements
    WHERE currency = v_cur
      AND status IN ('PENDING', 'PROCESSING', 'SIMULATED_TEST', 'PENDING_RECONCILIATION', 'COMPLETED')
    FOR UPDATE;

    -- Calculate total eligible provider-backed revenue
    SELECT COALESCE(SUM(rl.amount), 0)
    INTO v_total_revenue
    FROM public.revenue_logs rl
    JOIN public.transactions tx ON rl.source_transaction_id = tx.id
    WHERE rl.currency = v_cur
      AND (
        (LOWER(tx.provider) IN ('fincra', 'anchor', 'paystack', 'grey', 'nowpayments'))
        OR
        (tx.provider IS NULL AND (tx.metadata::text LIKE '%fincra%' OR tx.metadata::text LIKE '%FINCRA%'))
      )
      AND (tx.reference_id IS NULL OR (tx.reference_id NOT LIKE 'NS-%' AND tx.reference_id NOT LIKE 'MANUAL-CREDIT-%'));

    -- Calculate total already reserved or settled
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_reserved
    FROM public.platform_settlements
    WHERE currency = v_cur
      AND status IN ('PENDING', 'PROCESSING', 'SIMULATED_TEST', 'PENDING_RECONCILIATION', 'COMPLETED');

    v_available := v_total_revenue - v_total_reserved;

    IF v_available < p_amount THEN
        RAISE EXCEPTION
            'INSUFFICIENT_PLATFORM_REVENUE: Requested % % exceeds available % % (earned: %, reserved: %).',
            p_amount, v_cur, v_available, v_cur, v_total_revenue, v_total_reserved;
    END IF;

    IF p_is_live THEN
        v_status := 'PENDING';
    ELSE
        v_status := 'SIMULATED_TEST';
    END IF;

    INSERT INTO public.platform_settlements (
        reference,
        amount,
        currency,
        status,
        destination_account,
        initiated_by,
        available_at_request,
        metadata
    ) VALUES (
        p_reference,
        p_amount,
        v_cur,
        v_status,
        p_destination,
        p_initiated_by,
        v_available,
        p_metadata
    )
    RETURNING * INTO v_record;

    RETURN v_record;
END;
$$;

COMMIT;
