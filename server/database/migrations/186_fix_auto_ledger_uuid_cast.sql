-- ============================================================================
-- Migration 186: Fix auto ledger UUID cast
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_auto_ledger_fn()
RETURNS TRIGGER AS $$
DECLARE 
    v_exists BOOLEAN;
    v_wallet_id UUID;
BEGIN
    -- Transition to COMPLETED or confirmed 
    IF (NEW.status IN ('COMPLETED', 'confirmed') AND (OLD.status IS NULL OR OLD.status NOT IN ('COMPLETED', 'confirmed'))) THEN
        -- FIX: cast NEW.id to text for comparison with reference (which is text)
        SELECT EXISTS (SELECT 1 FROM public.ledger_entries WHERE reference = NEW.id::text) INTO v_exists;
        
        IF NOT v_exists THEN
            -- Try to resolve wallet_id if missing
            v_wallet_id := NEW.wallet_id;
            IF v_wallet_id IS NULL THEN
                SELECT id INTO v_wallet_id FROM public.wallets_store 
                WHERE user_id = NEW.user_id AND currency = COALESCE(NEW.from_currency, NEW.currency) 
                LIMIT 1;
            END IF;

            IF v_wallet_id IS NOT NULL THEN
                INSERT INTO public.ledger_entries (user_id, wallet_id, currency, amount, type, reference, status)
                VALUES (
                    NEW.user_id, 
                    v_wallet_id, 
                    COALESCE(NEW.from_currency, NEW.currency), 
                    CASE 
                        WHEN NEW.type IN ('DEPOSIT', 'deposit', 'FUNDING', 'funding', 'Digital Assets Purchase', 'transfer_in', 'swap_credit', 'affiliate_commission') THEN ABS(COALESCE(NEW.amount_from, NEW.amount))
                        ELSE -ABS(COALESCE(NEW.amount_from, NEW.amount) + COALESCE(NEW.fee, 0)) 
                    END,
                    LOWER(NEW.type), 
                    NEW.id::text,
                    'confirmed'
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
