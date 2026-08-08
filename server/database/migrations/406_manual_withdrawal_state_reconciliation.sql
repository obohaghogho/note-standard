-- Migration 406: Universal Withdrawal State Machine, Multi-Currency Idempotency & Reconciliation Schema
-- Enterprise NoteStandard Multi-Currency Banking Hardening

-- 1. Add reserved_balance column to public.wallets_store
ALTER TABLE public.wallets_store
  ADD COLUMN IF NOT EXISTS reserved_balance NUMERIC(30,8) NOT NULL DEFAULT 0;

-- 2. Add multi-state machine columns to public.fincra_transactions and public.transactions tables
ALTER TABLE public.fincra_transactions 
  ADD COLUMN IF NOT EXISTS withdrawal_status VARCHAR(50) DEFAULT 'INITIATED',
  ADD COLUMN IF NOT EXISTS funds_status VARCHAR(50) DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(50) DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN IF NOT EXISTS manual_review_status VARCHAR(50) DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(50) DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS error_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by VARCHAR(100);

ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS withdrawal_status VARCHAR(50) DEFAULT 'INITIATED',
  ADD COLUMN IF NOT EXISTS funds_status VARCHAR(50) DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(50) DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN IF NOT EXISTS manual_review_status VARCHAR(50) DEFAULT 'NOT_REQUIRED';

-- 2. Backfill existing fincra_transactions records to maintain schema purity
UPDATE public.fincra_transactions 
SET 
  withdrawal_status = CASE 
    WHEN status IN ('SUCCESSFUL', 'COMPLETED', 'SETTLED') THEN 'COMPLETED'
    WHEN status IN ('FAILED', 'REJECTED') THEN 'FAILED'
    WHEN status IN ('REVERSED', 'CANCELLED') THEN 'REVERSED'
    WHEN status IN ('MANUAL_REVIEW', 'MANUAL_PENDING') THEN 'PENDING_REVIEW'
    WHEN status IN ('PROCESSING', 'PENDING') THEN 'PROCESSING'
    ELSE 'INITIATED'
  END,
  funds_status = CASE
    WHEN status IN ('SUCCESSFUL', 'COMPLETED', 'SETTLED') THEN 'DEBITED'
    WHEN status IN ('RESERVED', 'PROCESSING', 'PENDING', 'MANUAL_REVIEW', 'MANUAL_PENDING') THEN 'RESERVED'
    WHEN status IN ('FAILED', 'REVERSED', 'CANCELLED', 'REJECTED') THEN 'RELEASED'
    ELSE 'AVAILABLE'
  END,
  provider_status = CASE
    WHEN status IN ('SUCCESSFUL', 'COMPLETED', 'SETTLED') THEN 'SUCCESS'
    WHEN status IN ('PROCESSING', 'PENDING') THEN 'PROCESSING'
    WHEN status IN ('FAILED', 'REJECTED') THEN 'FAILED'
    WHEN status IN ('REVERSED') THEN 'REVERSED'
    ELSE 'NOT_SUBMITTED'
  END,
  manual_review_status = CASE
    WHEN status IN ('MANUAL_REVIEW', 'MANUAL_PENDING') THEN 'PENDING'
    ELSE 'NOT_REQUIRED'
  END,
  idempotency_key = COALESCE(idempotency_key, reference, withdrawal_reference, id::text)
WHERE type = 'WITHDRAWAL' AND (withdrawal_status IS NULL OR withdrawal_status = 'INITIATED');

-- 3. Create indices for performance across multi-currency queries
CREATE INDEX IF NOT EXISTS idx_fincra_tx_withdrawal_status ON public.fincra_transactions(withdrawal_status);
CREATE INDEX IF NOT EXISTS idx_fincra_tx_funds_status ON public.fincra_transactions(funds_status);
CREATE INDEX IF NOT EXISTS idx_fincra_tx_provider_status ON public.fincra_transactions(provider_status);
CREATE INDEX IF NOT EXISTS idx_fincra_tx_manual_review_status ON public.fincra_transactions(manual_review_status);
CREATE INDEX IF NOT EXISTS idx_fincra_tx_reconciliation_status ON public.fincra_transactions(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_fincra_tx_currency ON public.fincra_transactions(currency);

-- 4. Unique constraints for idempotency (where set)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fincra_tx_idempotency_key 
  ON public.fincra_transactions(idempotency_key) 
  WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

-- 5. Add check constraints for multi-state machine validation
ALTER TABLE public.fincra_transactions DROP CONSTRAINT IF EXISTS chk_fincra_tx_withdrawal_status;
ALTER TABLE public.fincra_transactions ADD CONSTRAINT chk_fincra_tx_withdrawal_status CHECK (
  withdrawal_status IN (
    'INITIATED', 'VALIDATED', 'RESERVED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PROCESSING',
    'PROVIDER_CONFIRMED', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED'
  )
);

ALTER TABLE public.fincra_transactions DROP CONSTRAINT IF EXISTS chk_fincra_tx_funds_status;
ALTER TABLE public.fincra_transactions ADD CONSTRAINT chk_fincra_tx_funds_status CHECK (
  funds_status IN ('AVAILABLE', 'RESERVED', 'DEBITED', 'RELEASED', 'REFUNDED')
);

ALTER TABLE public.fincra_transactions DROP CONSTRAINT IF EXISTS chk_fincra_tx_provider_status;
ALTER TABLE public.fincra_transactions ADD CONSTRAINT chk_fincra_tx_provider_status CHECK (
  provider_status IN ('NOT_SUBMITTED', 'SUBMITTED', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED', 'UNKNOWN')
);

ALTER TABLE public.fincra_transactions DROP CONSTRAINT IF EXISTS fincra_transactions_status_check;
ALTER TABLE public.fincra_transactions ADD CONSTRAINT fincra_transactions_status_check CHECK (
  status IN (
    'CREATED', 'RESERVED', 'PROCESSING', 'PENDING', 'SUCCESSFUL', 'COMPLETED',
    'FAILED', 'REJECTED', 'CANCELLED', 'REVERSED', 'MANUAL_REVIEW', 'MANUAL_PENDING', 'OTP_REQUIRED'
  )
);

ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_wallet_id_fkey;
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_wallet_id_fkey 
  FOREIGN KEY (wallet_id) REFERENCES public.wallets_store(id) ON DELETE CASCADE;

ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_type_check;
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_type_check CHECK (
  type IN (
    'DEPOSIT', 'deposit', 'WITHDRAWAL', 'withdrawal', 'TRANSFER_IN', 'transfer_in',
    'TRANSFER_OUT', 'transfer_out', 'SWAP_IN', 'swap_in', 'SWAP_OUT', 'swap_out',
    'FEE', 'fee', 'PAYOUT', 'payout', 'REFUND', 'refund'
  )
);

-- 6. Update RPCs for atomic three-tier balance updates on wallets_store
CREATE OR REPLACE FUNCTION public.reserve_for_withdrawal(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_avail NUMERIC;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'reserve_for_withdrawal: amount must be positive, got %', p_amount;
    END IF;
    SELECT available_balance INTO v_avail
    FROM public.wallets_store WHERE id = p_wallet_id FOR UPDATE;
    IF v_avail < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE: Available %, Required %', v_avail, p_amount;
    END IF;
    UPDATE public.wallets_store
    SET
        available_balance = available_balance - p_amount,
        reserved_balance  = COALESCE(reserved_balance, 0) + p_amount,
        updated_at        = NOW()
    WHERE id = p_wallet_id;
    RETURN v_avail - p_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_withdrawal(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'complete_withdrawal: amount must be positive, got %', p_amount;
    END IF;
    UPDATE public.wallets_store
    SET
        balance          = balance - p_amount,
        reserved_balance = GREATEST(0, COALESCE(reserved_balance, 0) - p_amount),
        updated_at       = NOW()
    WHERE id = p_wallet_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'complete_withdrawal: wallet % not found', p_wallet_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_withdrawal_reservation(
    p_wallet_id UUID,
    p_amount    NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'reverse_withdrawal_reservation: amount must be positive, got %', p_amount;
    END IF;
    UPDATE public.wallets_store
    SET
        available_balance = available_balance + p_amount,
        reserved_balance  = GREATEST(0, COALESCE(reserved_balance, 0) - p_amount),
        updated_at        = NOW()
    WHERE id = p_wallet_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reverse_withdrawal_reservation: wallet % not found', p_wallet_id;
    END IF;
END;
$$;
