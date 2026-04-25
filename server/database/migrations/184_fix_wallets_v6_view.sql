-- ============================================================================
-- Migration 184: Fix wallets_v6 View (Point to Sovereign Ledger)
-- ============================================================================
-- Purpose:
--   The wallets_v6 VIEW was computing balances from the old ledger_entries table.
--   This caused the dashboard to display negative and incorrect balances.
--   This migration replaces the view to read from wallets_store (materialized truth)
--   which is kept perfectly in sync with ledger_entries_v6 by our sovereign trigger.
-- ============================================================================

BEGIN;

-- Drop and recreate the wallets_v6 view to read from wallets_store
-- wallets_store.balance is the materialized truth, synced by trg_ledger_sovereign_sync

CREATE OR REPLACE VIEW public.wallets_v6 AS
SELECT
    ws.id,
    ws.user_id,
    ws.currency,
    ws.network,
    ws.address,
    ws.is_frozen,
    ws.provider,
    -- Balance from materialized store (enforced >= 0 by sovereign trigger)
    GREATEST(0, ws.balance) AS balance,
    -- Available = balance - any pending reservations
    GREATEST(0, ws.balance - COALESCE(
        (
            SELECT SUM(ABS(le.amount))
            FROM public.ledger_entries_v6 le
            JOIN public.ledger_transactions_v6 lt ON le.transaction_id = lt.id
            WHERE le.wallet_id = ws.id
              AND le.side = 'DEBIT'
              AND lt.status = 'PENDING'
        ), 0
    )) AS available_balance,
    -- Reserved = any pending debits
    COALESCE(
        (
            SELECT SUM(ABS(le.amount))
            FROM public.ledger_entries_v6 le
            JOIN public.ledger_transactions_v6 lt ON le.transaction_id = lt.id
            WHERE le.wallet_id = ws.id
              AND le.side = 'DEBIT'
              AND lt.status = 'PENDING'
        ), 0
    ) AS reserved_balance
FROM public.wallets_store ws
-- Exclude SYSTEM_LP accounts from user-facing view
WHERE ws.address NOT LIKE 'SYSTEM_LP_%';

COMMIT;
