-- ============================================================================
-- Migration 067: LEDGER-BASED WALLET BALANCE & RLS HARDENING
-- ============================================================================
-- Purpose:
--   1. Calculate wallet balance from completed transactions (Ledger as Source of Truth).
--   2. Ensure balance and available_balance cannot be less than 0.
--   3. Enable Row Level Security (RLS) on all tables and ensure base policies.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. LEDGER-BASED BALANCE DERIVATION
-- ============================================================================

-- Function to calculate balance from completed transactions for a specific wallet
CREATE OR REPLACE FUNCTION public.calculate_wallet_balance_from_ledger(p_wallet_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_credits NUMERIC;
    v_debits NUMERIC;
BEGIN
    -- Credits: sum of amount for credit types
    -- Types: TRANSFER_IN, SWAP_IN, DEPOSIT, AFFILIATE_COMMISSION, REFUND
    SELECT COALESCE(SUM(amount), 0)
    INTO v_credits
    FROM public.transactions
    WHERE wallet_id = p_wallet_id
      AND status = 'COMPLETED'
      AND type IN ('DEPOSIT', 'TRANSFER_IN', 'SWAP_IN', 'AFFILIATE_COMMISSION', 'REFUND');

    -- Debits: sum of (amount + fee) for debit types
    -- Types: WITHDRAWAL, TRANSFER_OUT, SWAP_OUT, PAYOUT, SUBSCRIPTION_PAYMENT, AD_PAYMENT
    SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0)
    INTO v_debits
    FROM public.transactions
    WHERE wallet_id = p_wallet_id
      AND status = 'COMPLETED'
      AND type IN ('WITHDRAWAL', 'TRANSFER_OUT', 'SWAP_OUT', 'PAYOUT', 'SUBSCRIPTION_PAYMENT', 'AD_PAYMENT', 'BUY');

    RETURN v_credits - v_debits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to calculate available balance (Ledger Balance - Pending/Active Debits)
CREATE OR REPLACE FUNCTION public.calculate_wallet_available_balance_from_ledger(p_wallet_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_ledger_balance NUMERIC;
    v_pending_debits NUMERIC;
BEGIN
    -- Get current ledger balance (COMPLETED only)
    v_ledger_balance := public.calculate_wallet_balance_from_ledger(p_wallet_id);

    -- Pending/Processing Debits: these funds are "reserved" and not available
    SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0)
    INTO v_pending_debits
    FROM public.transactions
    WHERE wallet_id = p_wallet_id
      AND status IN ('PENDING', 'PROCESSING')
      AND type IN ('WITHDRAWAL', 'TRANSFER_OUT', 'SWAP_OUT', 'PAYOUT', 'SUBSCRIPTION_PAYMENT', 'AD_PAYMENT', 'BUY');

    RETURN v_ledger_balance - v_pending_debits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Trigger function to synchronize balance on every transaction change
CREATE OR REPLACE FUNCTION public.sync_wallet_balance_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_id UUID;
    v_new_balance NUMERIC;
    v_new_available NUMERIC;
BEGIN
    -- Identify the wallet affected
    IF (TG_OP = 'DELETE') THEN
        v_wallet_id := OLD.wallet_id;
    ELSE
        v_wallet_id := NEW.wallet_id;
    END IF;

    -- Calculate current derived balances
    v_new_balance := public.calculate_wallet_balance_from_ledger(v_wallet_id);
    v_new_available := public.calculate_wallet_available_balance_from_ledger(v_wallet_id);

    -- Update the wallet record
    -- Note: If this violates CHECK (balance >= 0), it will ROLLBACK the transaction change.
    UPDATE public.wallets
    SET balance = v_new_balance,
        available_balance = v_new_available,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Set up the trigger on transactions
DROP TRIGGER IF EXISTS trg_sync_wallet_balance ON public.transactions;
CREATE TRIGGER trg_sync_wallet_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_wallet_balance_trigger_fn();


-- ============================================================================
-- 2. ENFORCE POSITIVE BALANCE CONSTRAINTS
-- ============================================================================

-- Ensure total balance constraint exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positive_balance') THEN
        ALTER TABLE public.wallets ADD CONSTRAINT positive_balance CHECK (balance >= 0);
    END IF;
END $$;

-- Ensure available_balance constraint exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positive_available_balance') THEN
        ALTER TABLE public.wallets ADD CONSTRAINT positive_available_balance CHECK (available_balance >= 0);
    END IF;
END $$;


-- ============================================================================
-- 3. RLS HARDENING (SWEEP ALL TABLES)
-- ============================================================================

-- A. Enable RLS on all known tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shared_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.broadcast_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auto_reply_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallet_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.media_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.revenue_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscription_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.public_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.translation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.comments ENABLE ROW LEVEL SECURITY;

-- B. Fix/Add missing policies for exchange_rates
DO $$
BEGIN
    DROP POLICY IF EXISTS "Anyone can view exchange rates" ON public.exchange_rates;
    CREATE POLICY "Anyone can view exchange rates" ON public.exchange_rates
        FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Admins can manage exchange rates" ON public.exchange_rates;
    CREATE POLICY "Admins can manage exchange rates" ON public.exchange_rates
        FOR ALL USING (is_admin(auth.uid()));
END $$;


-- ============================================================================
-- 4. INITIAL CONVERSION & BACKFILL
-- ============================================================================

-- Synchronize all balances based on current transaction history
-- If this fails, it means current data violates the positive balance rule.
UPDATE public.wallets w
SET balance = public.calculate_wallet_balance_from_ledger(w.id),
    available_balance = public.calculate_wallet_available_balance_from_ledger(w.id),
    updated_at = NOW();

COMMIT;
