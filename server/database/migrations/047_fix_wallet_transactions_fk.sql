-- Ensure wallet_id column exists in transactions table
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS wallet_id uuid;

-- Set up foreign key relationship to wallets table
ALTER TABLE public.transactions
DROP CONSTRAINT IF EXISTS fk_transactions_wallets, -- Drop if exists to avoid error
ADD CONSTRAINT fk_transactions_wallets
FOREIGN KEY (wallet_id) REFERENCES public.wallets(id);
