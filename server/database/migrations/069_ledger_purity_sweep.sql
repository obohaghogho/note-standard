-- ============================================================================
-- Migration 069: LEDGER PURITY SWEEP & COMMISSION REFACTOR
-- ============================================================================
-- Purpose:
--   1. Refactor remaining functions to follow the "Pure Ledger" pattern.
--   2. Clean up legacy manual wallet updates in commissions and rejected payouts.
--   3. Add metadata support for auditability in commissions.
-- ============================================================================

BEGIN;

-- 1. REFACTOR ADD_AFFILIATE_COMMISSION
--    Removing manual balance updates; relying on Migration 067 triggers.
CREATE OR REPLACE FUNCTION public.add_affiliate_commission(
    p_referred_user_id UUID,
    p_revenue_amount   NUMERIC,
    p_currency         TEXT,
    p_source_tx_id     UUID
) RETURNS VOID AS $$
DECLARE
    v_referrer_id           UUID;
    v_commission_percentage NUMERIC;
    v_commission_amount     NUMERIC;
    v_referrer_wallet_id    UUID;
BEGIN
    -- Get referrer info
    SELECT referrer_user_id, commission_percentage 
    INTO v_referrer_id, v_commission_percentage
    FROM affiliate_referrals WHERE referred_user_id = p_referred_user_id;

    IF v_referrer_id IS NULL THEN
        RETURN;
    END IF;

    v_commission_amount := (p_revenue_amount * v_commission_percentage) / 100.0;

    IF v_commission_amount > 0 THEN
        -- Find/Create referrer's wallet
        SELECT id INTO v_referrer_wallet_id FROM wallets 
        WHERE user_id = v_referrer_id AND currency = p_currency LIMIT 1;

        IF v_referrer_wallet_id IS NULL THEN
            INSERT INTO wallets (user_id, currency, balance, available_balance, address)
            VALUES (v_referrer_id, p_currency, 0, 0, 'AFFILIATE_' || v_referrer_id::text)
            RETURNING id INTO v_referrer_wallet_id;
        END IF;

        -- Record as transaction. Ledger Trigger handles balance update.
        INSERT INTO public.transactions (
            wallet_id, user_id, type, display_label, category,
            amount, currency, status, reference_id, provider,
            metadata, completed_at
        ) VALUES (
            v_referrer_wallet_id, v_referrer_id, 'AFFILIATE_COMMISSION', 'Affiliate Commission', 'affiliate',
            v_commission_amount, p_currency, 'COMPLETED', p_source_tx_id, 'system',
            jsonb_build_object(
                'referred_user_id', p_referred_user_id,
                'revenue_source_id', p_source_tx_id
            ),
            NOW()
        );

        -- Update total stats (non-balance tracking)
        UPDATE affiliate_referrals 
        SET total_commission_earned = total_commission_earned + v_commission_amount
        WHERE referred_user_id = p_referred_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. REFACTOR REJECT_PAYOUT
--    Removing manual WALLET updates (available_balance refund).
--    Trigger trg_sync_wallet_balance (Migration 067) will automatically
--    restore available_balance when status changes from PENDING to CANCELLED.
CREATE OR REPLACE FUNCTION public.reject_payout(
    p_payout_id  UUID,
    p_admin_id   UUID,
    p_reason     TEXT DEFAULT 'Rejected by admin'
) RETURNS VOID AS $$
DECLARE
    v_tx_id UUID;
BEGIN
    SELECT transaction_id INTO v_tx_id FROM payout_requests WHERE id = p_payout_id FOR UPDATE;

    -- Update linked transaction. This triggers the balance re-calculation.
    UPDATE public.transactions
    SET status = 'CANCELLED',
        cancelled_at = NOW(),
        metadata = metadata || jsonb_build_object('rejection_reason', p_reason)
    WHERE id = v_tx_id;

    -- Update payout request status
    UPDATE public.payout_requests
    SET status = 'rejected',
        reviewed_by = p_admin_id,
        reviewed_at = NOW(),
        review_note = p_reason
    WHERE id = p_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. ENHANCE REVENUE LOGGING TRIGGER
--    Auto-log revenue when a transaction with a fee is completed.
CREATE OR REPLACE FUNCTION public.auto_log_revenue_on_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') AND NEW.fee > 0) THEN
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
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_revenue ON public.transactions;
CREATE TRIGGER trg_auto_revenue
    AFTER INSERT OR UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_log_revenue_on_completion();

COMMIT;
