-- Test Environment Reset Script
-- WARNING: This will delete ALL financial history.
-- Use ONLY in development/testing environments.

BEGIN;

  -- 1. Wipe the immutable ledger (source of truth)
  DELETE FROM ledger_entries;

  -- 2. Wipe the transaction logs
  DELETE FROM transactions;

  -- 3. Wipe pending webhook processing logs
  DELETE FROM webhook_logs;

  -- 4. Wipe active swap rate locks
  DELETE FROM swap_quotes;

  -- 5. Wipe temporary NOWPayments addresses to force regeneration
  DELETE FROM nowpayments_deposit_addresses;

  -- 6. Wipe all wallets (Since `wallets` is a view over `wallets_store`, we wipe the store)
  DELETE FROM wallets_store;

COMMIT;

-- Verify the wipe was successful
SELECT 
  (SELECT count(*) FROM wallets_store) as active_wallets,
  (SELECT count(*) FROM ledger_entries) as ledger_records,
  (SELECT count(*) FROM transactions) as transaction_records;
