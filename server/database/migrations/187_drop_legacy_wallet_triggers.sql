-- ============================================================================
-- Migration 187: Drop legacy wallet sync triggers
-- ============================================================================

BEGIN;

-- The wallets view no longer has a static 'balance' column and calculates
-- balances on the fly. These legacy triggers from the old wallets table
-- cause errors when inserting into ledger_entries.
DROP TRIGGER IF EXISTS trg_sync_wallet_balance_ledger ON public.ledger_entries;
DROP FUNCTION IF EXISTS sync_wallet_balance_from_ledger_fn() CASCADE;

COMMIT;
