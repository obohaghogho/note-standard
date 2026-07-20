-- Migration 242: Fix wallets_v6 View and Filter System Wallets
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
-- Exclude all system/institutional accounts from the user-facing view
WHERE ws.address NOT LIKE 'SYSTEM_LP_%'
  AND ws.address NOT LIKE 'TREASURY_%'
  AND ws.address NOT LIKE 'SETTLEMENT_%'
  AND ws.address NOT LIKE 'REVENUE_%'
  AND ws.address NOT LIKE 'FX_POOL_%'
  AND ws.address NOT LIKE 'PENDING_%'
  AND ws.address NOT LIKE 'RECONCILIATION_%';

COMMIT;
