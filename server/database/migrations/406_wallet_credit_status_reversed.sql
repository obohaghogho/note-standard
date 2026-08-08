-- Migration 406: Add WALLET_REVERSED to chk_transactions_wallet_credit_status check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_wallet_credit_status'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT chk_transactions_wallet_credit_status;
  END IF;

  ALTER TABLE public.transactions ADD CONSTRAINT chk_transactions_wallet_credit_status CHECK (
    wallet_credit_status IN ('WALLET_CREDIT_PENDING', 'WALLET_CREDITED', 'WALLET_REVERSED', 'FAILED')
  );
END $$;
