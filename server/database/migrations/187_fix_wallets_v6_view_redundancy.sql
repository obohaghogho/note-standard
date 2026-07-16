-- ============================================================================
-- Migration 187: Fix wallets_v6 View Redundancy
-- ============================================================================
-- Purpose:
--   Removes redundant calculation of available_balance in the view layer.
--   Since Migration 186 now accurately materializes both balance and
--   available_balance in wallets_store, the view should simply read
--   them directly to avoid double-counting pending transactions.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.wallets_v6 AS
SELECT
    ws.id,
    ws.user_id,
    ws.currency,
    ws.network,
    ws.address,
    ws.is_frozen,
    ws.provider,
    -- Read directly from materialized truth in wallets_store
    GREATEST(0, ws.balance) AS balance,
    GREATEST(0, ws.available_balance) AS available_balance,
    -- Reserved = balance - available_balance
    GREATEST(0, ws.balance - ws.available_balance) AS reserved_balance
FROM public.wallets_store ws
-- Exclude SYSTEM_LP accounts from user-facing view
WHERE ws.address NOT LIKE 'SYSTEM_LP_%';

COMMIT;
