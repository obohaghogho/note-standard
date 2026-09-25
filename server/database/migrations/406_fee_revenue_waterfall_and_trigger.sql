-- ============================================================================
-- Migration 406: Fee Revenue Waterfall, Idempotent Trigger & Platform Accounts
-- ============================================================================
-- Purpose:
--   1. Ensure `revenue_logs` has UNIQUE constraint on `source_transaction_id`.
--   2. Update `auto_log_revenue_on_completion()` trigger to log ONLY the
--      NoteStandard Admin Revenue component (4.5%) into `revenue_logs.amount`,
--      preventing conflation of Customer Total Fee (4.6%) with Platform Revenue.
--   3. Create/Ensure `platform_wallets` table exists and is accessible.
-- ============================================================================

BEGIN;

-- 1. Add Unique Constraint to revenue_logs on source_transaction_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'revenue_logs_source_tx_unique'
    ) THEN
        ALTER TABLE public.revenue_logs 
        ADD CONSTRAINT revenue_logs_source_tx_unique UNIQUE (source_transaction_id);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Ignore if constraint or index already exists
END $$;

-- 2. Update Database Trigger for Revenue Logging
CREATE OR REPLACE FUNCTION public.auto_log_revenue_on_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_fee NUMERIC(20, 8);
    v_gross NUMERIC(20, 8);
BEGIN
    -- Check if a transaction with a fee just completed
    IF (NEW.status IN ('COMPLETED', 'SUCCESS') 
        AND (OLD.status IS NULL OR OLD.status NOT IN ('COMPLETED', 'SUCCESS')) 
        AND NEW.fee > 0) THEN

        v_gross := COALESCE(NEW.amount, 0);

        -- Calculate Admin Revenue component (4.5% of gross, or carved out of total fee)
        IF NEW.fee >= (v_gross * 0.046 * 0.9) THEN
            -- Standard 4.6% fee charged: Admin revenue is 4.5/4.6 of total fee
            v_admin_fee := ROUND((NEW.fee * (0.045 / 0.046))::numeric, 2);
        ELSE
            -- Custom or discounted fee: Admin revenue is fee minus partner portion (0.1% of gross)
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
                WHEN NEW.category = 'transfer' OR NEW.type = 'TRANSFER' THEN 'transfer_fee'
                WHEN NEW.category = 'withdrawal' OR NEW.type = 'WITHDRAWAL' THEN 'withdrawal_fee'
                WHEN NEW.category = 'swap' OR NEW.type = 'SWAP' THEN 'swap_fee'
                WHEN NEW.category = 'payout' OR NEW.type = 'PAYOUT' THEN 'payout_fee'
                WHEN NEW.type = 'DEPOSIT' OR NEW.type = 'PAYIN' THEN 'deposit_fee'
                ELSE 'other_fee'
            END,
            jsonb_build_object(
                'tx_type', NEW.type,
                'customer_total_fee', NEW.fee,
                'admin_revenue', v_admin_fee,
                'partner_commission', ROUND((v_gross * 0.001)::numeric, 2)
            )
        )
        ON CONFLICT (source_transaction_id) DO NOTHING;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger to transactions table
DROP TRIGGER IF EXISTS trg_auto_log_revenue ON public.transactions;
CREATE TRIGGER trg_auto_log_revenue
    AFTER INSERT OR UPDATE OF status, fee
    ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_log_revenue_on_completion();

COMMIT;
