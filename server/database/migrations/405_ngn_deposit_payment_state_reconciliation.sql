-- Migration 405: NGN Deposit Payment State Machine, Idempotency & Reconciliation Schema
-- NoteStandard Enterprise Banking & Payment Hardening

-- 1. Add multi-state machine columns to transactions table
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'INITIATED',
  ADD COLUMN IF NOT EXISTS receipt_status VARCHAR(50) DEFAULT 'NOT_PROVIDED',
  ADD COLUMN IF NOT EXISTS wallet_credit_status VARCHAR(50) DEFAULT 'WALLET_CREDIT_PENDING',
  ADD COLUMN IF NOT EXISTS provider_transaction_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(50) DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by VARCHAR(100);

-- 2. Backfill existing records to maintain schema purity
UPDATE public.transactions 
SET 
  payment_status = CASE 
    WHEN status IN ('COMPLETED', 'SUCCESS', 'SETTLED', 'POSTED', 'SUCCEEDED') THEN 'PAYMENT_CONFIRMED'
    WHEN status IN ('FAILED', 'CANCELLED', 'EXPIRED') THEN 'PAYMENT_FAILED'
    WHEN status IN ('REVERSED', 'REFUNDED') THEN 'PAYMENT_REVERSED'
    ELSE 'PAYMENT_PENDING'
  END,
  receipt_status = CASE
    WHEN metadata->>'proof_url' IS NOT NULL THEN 'UPLOADED'
    ELSE 'NOT_PROVIDED'
  END,
  wallet_credit_status = CASE
    WHEN status IN ('COMPLETED', 'SUCCESS', 'SETTLED', 'POSTED', 'SUCCEEDED') THEN 'WALLET_CREDITED'
    ELSE 'WALLET_CREDIT_PENDING'
  END,
  idempotency_key = COALESCE(idempotency_key, reference_id, provider_reference, id::text)
WHERE payment_status IS NULL OR payment_status = 'INITIATED';

-- 3. Create indices for multi-state queries and reconciliation performance
CREATE INDEX IF NOT EXISTS idx_transactions_payment_status ON public.transactions(payment_status);
CREATE INDEX IF NOT EXISTS idx_transactions_receipt_status ON public.transactions(receipt_status);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_credit_status ON public.transactions(wallet_credit_status);
CREATE INDEX IF NOT EXISTS idx_transactions_reconciliation_status ON public.transactions(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_transactions_provider_tx_id ON public.transactions(provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency_key ON public.transactions(idempotency_key);

-- 4. Add unique index on idempotency_key for wallet credit protection (where set)
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_idempotency_key 
  ON public.transactions(idempotency_key) 
  WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

-- 5. Add table check constraints for state machine validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_payment_status'
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT chk_transactions_payment_status CHECK (
      payment_status IN (
        'INITIATED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'WALLET_CREDIT_PENDING', 'WALLET_CREDITED',
        'PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'PAYMENT_REVERSED', 'MANUAL_REVIEW_REQUIRED'
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_receipt_status'
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT chk_transactions_receipt_status CHECK (
      receipt_status IN ('NOT_PROVIDED', 'UPLOADED', 'VERIFIED', 'REJECTED')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_wallet_credit_status'
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT chk_transactions_wallet_credit_status CHECK (
      wallet_credit_status IN ('WALLET_CREDIT_PENDING', 'WALLET_CREDITED', 'FAILED')
    );
  END IF;
END $$;
