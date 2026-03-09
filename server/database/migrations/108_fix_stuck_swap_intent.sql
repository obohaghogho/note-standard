-- Migration 108: Fix stuck SWAP_INTENT transaction
-- The external swap path deducted 7265 USD but never credited BTC.
-- This reverses the stuck intent and restores the user's balance.

-- 1. Restore USD balance
UPDATE public.wallets_store
SET balance = balance + 7265,
    available_balance = available_balance + 7265,
    updated_at = NOW()
WHERE id = 'ce96f0a7-594d-49fb-bfcd-3423448a14b5';

-- 2. Mark the stuck SWAP_INTENT as FAILED
UPDATE public.transactions
SET status = 'FAILED',
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"failReason": "External conversion simulation - no webhook to finalize. Reversed."}'::jsonb
WHERE id = 'a8c16ce3-8a15-48a5-87ce-e783812c9cc0'
  AND type = 'SWAP_INTENT'
  AND status = 'PENDING';

-- 3. Mark the associated quote as EXPIRED
UPDATE public.swap_quotes
SET status = 'EXPIRED', updated_at = NOW()
WHERE id = '7f9c87bf-2b7f-46c4-bcf0-78882e1845fb'
  AND status = 'PROCESSING';

-- 4. Add a reversal ledger entry
INSERT INTO public.ledger_entries (user_id, wallet_id, type, amount, currency, reference, status)
VALUES (
    '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd',
    'ce96f0a7-594d-49fb-bfcd-3423448a14b5',
    'swap_reversal',
    7265,
    'USD',
    'a8c16ce3-8a15-48a5-87ce-e783812c9cc0',
    'confirmed'
);

-- 5. Also expire all orphaned PENDING quotes for this user
UPDATE public.swap_quotes
SET status = 'EXPIRED', updated_at = NOW()
WHERE user_id = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd'
  AND status = 'PENDING';
