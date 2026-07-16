-- ============================================================================
-- Migration 079: PERSISTENT SWAP QUOTES & HARDENED EXECUTION
-- ============================================================================
-- Purpose:
--   1. Create 'swap_quotes' table for secure, auditable currency swaps.
--   2. Implement 'execute_swap_from_quote' RPC to enforce strict logic:
--      Lock Quote -> Lock Source -> Lock Target -> Deduct -> Credit -> Record.
--   3. Prevent "blind" balance updates by deriving amounts from the quote.
-- ============================================================================

BEGIN;

-- 1. SWAP QUOTES TABLE
CREATE TABLE IF NOT EXISTS public.swap_quotes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    from_wallet_id      UUID REFERENCES public.wallets_store(id),
    to_wallet_id        UUID REFERENCES public.wallets_store(id),
    from_amount         NUMERIC NOT NULL,
    to_amount           NUMERIC NOT NULL,
    from_currency       TEXT NOT NULL,
    to_currency         TEXT NOT NULL,
    rate                NUMERIC NOT NULL,
    fee                 NUMERIC DEFAULT 0,
    status              TEXT DEFAULT 'PENDING', -- 'PENDING', 'EXECUTED', 'EXPIRED'
    expires_at          TIMESTAMPTZ NOT NULL,
    idempotency_key     TEXT UNIQUE,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_quotes_user ON public.swap_quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_swap_quotes_expiry ON public.swap_quotes(expires_at);

ALTER TABLE public.swap_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own swap quotes" ON public.swap_quotes;
CREATE POLICY "Users can view own swap quotes" ON public.swap_quotes
    FOR SELECT USING (auth.uid() = user_id);


-- 2. HARDENED SWAP EXECUTION RPC
CREATE OR REPLACE FUNCTION public.execute_swap_from_quote(
    p_quote_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_quote      RECORD;
    v_tx_id      UUID;
    v_txn_ref    TEXT;
    v_wallet_1   UUID;
    v_wallet_2   UUID;
    v_sender_uid UUID;
    v_max_swap   NUMERIC;
BEGIN
    -- STEP 1: Lock and validate the quote
    SELECT * INTO v_quote 
    FROM public.swap_quotes 
    WHERE id = p_quote_id 
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND'; END IF;
    IF v_quote.status != 'PENDING' THEN RAISE EXCEPTION 'QUOTE_ALREADY_USED_OR_EXPIRED'; END IF;
    IF v_quote.expires_at < NOW() THEN 
        UPDATE public.swap_quotes SET status = 'EXPIRED' WHERE id = p_quote_id;
        RAISE EXCEPTION 'QUOTE_EXPIRED'; 
    END IF;

    -- STEP 1.5: Max Swap Limit Check (Safety Net)
    SELECT (value#>>'{}')::NUMERIC INTO v_max_swap FROM public.admin_settings WHERE key = 'max_swap_amount';
    IF v_quote.from_amount > v_max_swap THEN
        RAISE EXCEPTION 'MAX_SWAP_EXCEEDED (Max: %, Req: %)', v_max_swap, v_quote.from_amount;
    END IF;

    -- STEP 2: Atomic Wallet Locking (The "Lock BTC Amount" Phase)
    -- We lock both rows in defined order (alphabetical UUID) to avoid deadlocks.
    IF v_quote.from_wallet_id < v_quote.to_wallet_id THEN
        v_wallet_1 := v_quote.from_wallet_id;
        v_wallet_2 := v_quote.to_wallet_id;
    ELSE
        v_wallet_1 := v_quote.to_wallet_id;
        v_wallet_2 := v_quote.from_wallet_id;
    END IF;

    PERFORM 1 FROM public.wallets_store WHERE id = v_wallet_1 FOR UPDATE;
    PERFORM 1 FROM public.wallets_store WHERE id = v_wallet_2 FOR UPDATE;

    -- STEP 3: Verify Source Balance
    IF (SELECT available_balance FROM public.wallets_store WHERE id = v_quote.from_wallet_id) < (v_quote.from_amount + v_quote.fee) THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS_FOR_SWAP';
    END IF;

    -- STEP 4: Generate Reference (Compliance)
    v_txn_ref := 'TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::text FROM 1 FOR 8));

    -- STEP 5: Deduct From BTC (and Fee)
    UPDATE public.wallets_store 
    SET balance = balance - (v_quote.from_amount + v_quote.fee),
        available_balance = available_balance - (v_quote.from_amount + v_quote.fee),
        updated_at = NOW()
    WHERE id = v_quote.from_wallet_id;

    -- STEP 6: Credit To USD
    UPDATE public.wallets_store 
    SET balance = balance + v_quote.to_amount,
        available_balance = available_balance + v_quote.to_amount,
        updated_at = NOW()
    WHERE id = v_quote.to_wallet_id;

    -- STEP 7: Record in Transactions & Ledger
    INSERT INTO public.transactions (
        user_id, wallet_id, type, from_currency, to_currency, 
        amount_from, amount_to, rate, fee, status, 
        idempotency_key, txn_reference, metadata,
        created_at, completed_at
    ) VALUES (
        v_quote.user_id, v_quote.from_wallet_id, 'swap', v_quote.from_currency, v_quote.to_currency, 
        v_quote.from_amount, v_quote.to_amount, v_quote.rate, v_quote.fee, 'COMPLETED', 
        p_idempotency_key, v_txn_ref, v_quote.metadata || jsonb_build_object('quote_id', p_quote_id),
        NOW(), NOW()
    ) RETURNING id INTO v_tx_id;

    -- Ledger Entries (Double Entry)
    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) 
    VALUES (v_quote.user_id, v_quote.from_wallet_id, v_quote.from_currency, -(v_quote.from_amount + v_quote.fee), 'swap_debit', v_tx_id);

    INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference) 
    VALUES (v_quote.user_id, v_quote.to_wallet_id, v_quote.to_currency, v_quote.to_amount, 'swap_credit', v_tx_id);

    -- STEP 8: Confirm & Finalize Quote
    UPDATE public.swap_quotes SET status = 'EXECUTED', metadata = metadata || jsonb_build_object('tx_id', v_tx_id) WHERE id = p_quote_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
