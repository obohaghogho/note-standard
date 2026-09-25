-- =============================================================================
-- Migration 493: Guard revenue trigger against provider-NULL / test transactions
-- =============================================================================
-- Purpose:
--   Replace auto_log_revenue_on_completion() with an identical function that adds
--   one additional guard: LOWER(NEW.provider) must be a known production provider.
--
--   This prevents internal/test transactions (provider IS NULL or unknown) from
--   being recorded as real platform revenue in revenue_logs.
--
-- Approved provider allowlist (verified 2026-09-25 via forensic audit):
--   fincra      — NGN deposits, withdrawals (primary provider)
--   anchor      — NGN banking rails
--   paystack    — Card deposits / reconciliation
--   grey        — USD/EUR/GBP ACH, SEPA, Wire, Faster Payments
--   nowpayments — Crypto deposits (forward-compatible)
--
-- LOWER() applied to guard against any future mixed-case insertion.
--
-- Safety properties:
--   - CREATE OR REPLACE FUNCTION only — no schema change
--   - No trigger re-attachment needed:
--       trg_auto_revenue and trg_auto_log_revenue both call this function by name;
--       replacing the function automatically updates both triggers.
--   - No INSERT/UPDATE/DELETE on any data table
--   - ON CONFLICT (source_transaction_id) DO NOTHING unchanged — idempotency preserved
--   - SECURITY DEFINER preserved
--   - All fee arithmetic unchanged (4.5/4.6 split, partner commission 0.1%)
--   - Existing revenue_logs rows are NOT affected
--   - Historical transactions are NOT modified
--   - wallets_store is NOT modified
--   - Customer balances are NOT modified
--   - Settlement logic is NOT modified
--   - Provider integrations are NOT modified
--
-- Reversal: remove the AND LOWER(NEW.provider) IN (...) line.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_log_revenue_on_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_fee NUMERIC(20, 8);
    v_gross     NUMERIC(20, 8);
BEGIN
    -- Only log revenue for real production provider transactions.
    -- Provider must be a known, cash-backed payment provider.
    -- Transactions with provider IS NULL or an unknown value are excluded.
    IF (NEW.status IN ('COMPLETED', 'SUCCESS')
        AND (OLD.status IS NULL OR OLD.status NOT IN ('COMPLETED', 'SUCCESS'))
        AND NEW.fee > 0
        AND LOWER(NEW.provider) IN ('fincra', 'anchor', 'paystack', 'grey', 'nowpayments')) THEN

        v_gross := COALESCE(NEW.amount, 0);

        -- Calculate Admin Revenue component (4.5/4.6 split)
        IF NEW.fee >= (v_gross * 0.046 * 0.9) THEN
            -- Standard 4.6% fee charged: Admin revenue is 4.5/4.6 of total fee
            v_admin_fee := ROUND((NEW.fee * (0.045 / 0.046))::numeric, 2);
        ELSE
            -- Custom or discounted fee: Admin revenue = fee minus 0.1% partner portion
            v_admin_fee := ROUND(GREATEST(0, NEW.fee - (v_gross * 0.001))::numeric, 2);
        END IF;

        -- Insert NoteStandard Platform Revenue component into revenue_logs idempotently
        INSERT INTO public.revenue_logs (
            source_transaction_id,
            user_id,
            amount,
            currency,
            revenue_type,
            metadata
        ) VALUES (
            NEW.id,
            NEW.user_id,
            v_admin_fee,
            UPPER(NEW.currency),
            CASE
                WHEN NEW.category = 'transfer'   OR NEW.type = 'TRANSFER'   THEN 'transfer_fee'
                WHEN NEW.category = 'withdrawal' OR NEW.type = 'WITHDRAWAL' THEN 'withdrawal_fee'
                WHEN NEW.category = 'swap'       OR NEW.type = 'SWAP'       THEN 'swap_fee'
                WHEN NEW.category = 'payout'     OR NEW.type = 'PAYOUT'     THEN 'payout_fee'
                WHEN NEW.type = 'DEPOSIT' OR NEW.type = 'PAYIN'             THEN 'deposit_fee'
                ELSE 'other_fee'
            END,
            jsonb_build_object(
                'tx_type',            NEW.type,
                'customer_total_fee', NEW.fee,
                'admin_revenue',      v_admin_fee,
                'partner_commission', ROUND((v_gross * 0.001)::numeric, 2)
            )
        )
        ON CONFLICT (source_transaction_id) DO NOTHING;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
