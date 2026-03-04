-- Migration 085: Archive HD Wallet Infrastructure (Phase 2 Cleanup)
--
-- BACKGROUND:
--   The platform previously used a self-hosted HD wallet system (BIP32/BIP44)
--   that derived BTC/ETH addresses from a master mnemonic stored in environment
--   variables. This constituted direct crypto custody, making the platform a VASP
--   under FATF and an MSB under FinCEN — without the required licenses.
--
--   Phase 1 replaced those endpoints with NOWPayments-delegated addresses.
--   Phase 2 removes the database tables that backed the HD system.
--
-- SAFE TO RUN:
--   No active routes reference crypto_hd_addresses or crypto_hd_indices.
--   The nowpayments_deposit_addresses table (migration 084) is the new source of truth.

-- Step 1: Drop the HD address derivation function (no longer needed)
DROP FUNCTION IF EXISTS get_and_increment_hd_index(UUID, TEXT);

-- Step 2: Archive HD address records before dropping
--   We keep a snapshot in a _archive table for audit trail purposes.
CREATE TABLE IF NOT EXISTS crypto_hd_addresses_archive AS
    SELECT *, NOW() AS archived_at FROM crypto_hd_addresses;

CREATE TABLE IF NOT EXISTS crypto_hd_indices_archive AS
    SELECT *, NOW() AS archived_at FROM crypto_hd_indices;

-- Step 3: Drop the live HD wallet tables
--   Policies and indices are dropped automatically with the tables.
DROP TABLE IF EXISTS crypto_hd_addresses CASCADE;
DROP TABLE IF EXISTS crypto_hd_indices CASCADE;

-- Step 4: Add a comment on the archive tables so future devs understand the context
COMMENT ON TABLE crypto_hd_addresses_archive IS
    'Archived from crypto_hd_addresses during Phase 2 HD wallet removal (migration 085). '
    'Kept for audit trail only. The platform no longer generates or custodies crypto addresses. '
    'All crypto deposits are now handled by NOWPayments (see nowpayments_deposit_addresses).';

COMMENT ON TABLE crypto_hd_indices_archive IS
    'Archived from crypto_hd_indices during Phase 2 HD wallet removal (migration 085). '
    'Kept for audit trail only.';
