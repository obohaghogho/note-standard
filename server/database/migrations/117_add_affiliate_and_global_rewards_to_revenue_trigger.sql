-- ============================================================================
-- Migration 117: FIX AFFILIATE & GLOBAL REWARD COMMISSION TRIGGERS
-- ============================================================================
-- Purpose:
--   The previous migration (069) created `auto_log_revenue_on_completion` 
--   which successfully tracked platform revenue in `revenue_logs`. However, 
--   it completely omitted calling the `add_affiliate_commission` and 
--   `add_global_reward` RPCs. This broke the entire Affiliate system since
--   commissions were never being calculated or paid out automatically.
--   This migration restores those trigger calls ensuring 100% automated payouts.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_log_revenue_on_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if a transaction with a fee just completed
    IF (NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') AND NEW.fee > 0) THEN
        
        -- 1. Log the Platform Revenue
        INSERT INTO public.revenue_logs (
            source_transaction_id, user_id, amount, currency, revenue_type, metadata
        ) VALUES (
            NEW.id, NEW.user_id, NEW.fee, NEW.currency, 
            CASE 
                WHEN NEW.category = 'transfer' THEN 'transfer_fee'
                WHEN NEW.category = 'withdrawal' THEN 'withdrawal_fee'
                WHEN NEW.category = 'swap' THEN 'swap_fee'
                WHEN NEW.category = 'payout' THEN 'payout_fee'
                ELSE 'other_fee'
            END,
            jsonb_build_object('tx_type', NEW.type)
        );

        -- 2. Automatically trigger Affiliate Commission payout (if user was referred)
        PERFORM public.add_affiliate_commission(
            NEW.user_id,          -- The user generating the revenue
            NEW.fee,              -- The revenue amount to carve the commission out of
            NEW.currency,         -- The currency of the fee
            NEW.id                -- The source transaction ID
        );

        -- 3. Automatically trigger Global Rewards pooling
        PERFORM public.add_global_reward(
            NEW.fee,              -- The revenue amount
            NEW.currency,         -- The currency
            NEW.id                -- The source transaction ID
        );

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
