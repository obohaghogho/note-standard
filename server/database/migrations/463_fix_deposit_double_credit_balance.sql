-- ============================================================================
-- Migration 463: Fix Deposit Double-Credit Balance Corruption
-- ============================================================================
-- Problem:
--   A bug in manualDepositController.js allowed the same deposit to be credited
--   multiple times because each approval path created a new transactions row
--   with a new UUID, bypassing the ledger idempotency key check.
--
--   Reported case: User "Aghogho Oboh" deposited 1,000 NGN.
--   Old balance: 6,450 NGN. Expected: 7,450 NGN. Actual: 9,000 NGN.
--
-- Fix:
--   1. Audit all wallets: compare wallets_store.balance vs SUM(ledger_entries_v6)
--   2. Correct any wallet whose stored balance > ledger truth (over-credited)
--   3. Log all corrections to admin_audit_logs for compliance trail
-- ============================================================================

BEGIN;

-- ─── 1. Audit table for this correction run ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.balance_correction_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL,
    user_id         UUID NOT NULL,
    currency        VARCHAR(10),
    balance_before  NUMERIC,
    balance_correct NUMERIC,
    delta           NUMERIC,
    corrected_at    TIMESTAMPTZ DEFAULT NOW(),
    reason          TEXT DEFAULT 'double_credit_correction_migration_463'
);

-- ─── 2. Identify and correct over-credited wallets ───────────────────────────
DO $$
DECLARE
    rec RECORD;
    v_ledger_balance NUMERIC;
    v_avail_balance  NUMERIC;
BEGIN
    -- Iterate over all personal (non-system) wallets
    FOR rec IN
        SELECT ws.id, ws.user_id, ws.currency, ws.balance, ws.available_balance
        FROM public.wallets_store ws
        WHERE ws.address NOT LIKE 'SYSTEM_%'
          AND ws.address NOT LIKE 'SETTLEMENT_%'
          AND ws.address NOT LIKE 'TREASURY_%'
          AND ws.address NOT LIKE 'REVENUE_%'
          AND ws.address NOT LIKE 'FX_POOL_%'
          AND ws.address NOT LIKE 'PENDING_%'
          AND ws.address NOT LIKE 'RECONCILIATION_%'
    LOOP
        -- Compute true balance from the immutable ledger journal
        SELECT COALESCE(SUM(le.amount), 0)
        INTO v_ledger_balance
        FROM public.ledger_entries_v6 le
        WHERE le.wallet_id = rec.id;

        -- If stored balance is higher than ledger truth → over-credited
        IF rec.balance > v_ledger_balance + 0.01 THEN

            -- Proportionally correct available_balance too
            v_avail_balance := GREATEST(0, rec.available_balance - (rec.balance - v_ledger_balance));

            -- Log the correction
            INSERT INTO public.balance_correction_log
                (wallet_id, user_id, currency, balance_before, balance_correct, delta)
            VALUES
                (rec.id, rec.user_id, rec.currency, rec.balance, v_ledger_balance, rec.balance - v_ledger_balance);

            -- Apply correction
            UPDATE public.wallets_store
            SET balance           = v_ledger_balance,
                available_balance = v_avail_balance,
                updated_at        = NOW()
            WHERE id = rec.id;

            RAISE NOTICE 'Corrected wallet % (user %) % : % → %',
                rec.id, rec.user_id, rec.currency, rec.balance, v_ledger_balance;
        END IF;
    END LOOP;

    RAISE NOTICE 'Balance correction sweep complete.';
END $$;

-- ─── 3. Verify correction for Aghogho Oboh ───────────────────────────────────
DO $$
DECLARE
    v_user_id    UUID;
    v_balance    NUMERIC;
    v_ledger_bal NUMERIC;
BEGIN
    -- Look up by username (case-insensitive)
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE LOWER(username) = LOWER('aghogho oboh')
       OR LOWER(full_name) LIKE '%aghogho%oboh%'
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'User aghogho oboh not found by name — skipping targeted check.';
        RETURN;
    END IF;

    SELECT ws.balance, COALESCE(SUM(le.amount), 0)
    INTO v_balance, v_ledger_bal
    FROM public.wallets_store ws
    LEFT JOIN public.ledger_entries_v6 le ON le.wallet_id = ws.id
    WHERE ws.user_id = v_user_id AND ws.currency = 'NGN'
    GROUP BY ws.balance
    LIMIT 1;

    RAISE NOTICE 'Aghogho Oboh NGN wallet — stored: %, ledger truth: %', v_balance, v_ledger_bal;
END $$;

-- ─── 4. RLS for correction log ───────────────────────────────────────────────
ALTER TABLE public.balance_correction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY bcl_service_only ON public.balance_correction_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
