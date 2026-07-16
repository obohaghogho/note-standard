-- 177_realign_ledger_truth.sql
-- Synchronizes wallets_store balance with the sum of ledger_entries (Source of Truth).
-- This fixes the 'Drift Detected' emergency and allows the system to exit SAFE mode.

BEGIN;

-- 1. Create a CTE to calculate the truth from the ledger
WITH ledger_truth AS (
    SELECT 
        wallet_id,
        SUM(
            CASE 
                WHEN type = 'CREDIT' AND LOWER(status) IN ('confirmed', 'settled', 'ledger_committed', 'success') THEN amount
                WHEN type = 'DEBIT' AND LOWER(status) IN ('confirmed', 'settled', 'ledger_committed', 'success') THEN -amount
                ELSE 0
            END
        ) as true_balance
    FROM ledger_entries
    GROUP BY wallet_id
)
-- 2. Update the wallets_store balance for wallets where drift exists
UPDATE wallets_store ws
SET balance = lt.true_balance,
    updated_at = NOW()
FROM ledger_truth lt
WHERE ws.id = lt.wallet_id
AND ABS(ws.balance - lt.true_balance) > 0.000001; -- Only update if drift > epsilon

-- 3. Reset System Metrics (Force refresh health check)
-- This logic is usually handled by the ReconciliationWorker in the next sweep.

COMMIT;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
