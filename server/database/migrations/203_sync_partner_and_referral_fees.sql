-- Migration 203: Synchronize Partner and Referral Fees to 0.1%
-- This migration ensures that all partner (global reward) and referral (affiliate) fees 
-- are strictly set to 0.1% across the system, correcting any legacy values or mismatches.

BEGIN;

-- 1. Ensure admin_settings are strictly 0.1 for all relevant keys
UPDATE public.admin_settings SET value = '0.1'::jsonb WHERE key = 'affiliate_percentage';
UPDATE public.admin_settings SET value = '0.1'::jsonb WHERE key = 'partner_percentage';
UPDATE public.admin_settings SET value = '0.1'::jsonb WHERE key = 'global_reward_percentage';

-- Insert if they didn't exist
INSERT INTO public.admin_settings (key, value) VALUES ('affiliate_percentage', '0.1'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.admin_settings (key, value) VALUES ('partner_percentage', '0.1'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.admin_settings (key, value) VALUES ('global_reward_percentage', '0.1'::jsonb) ON CONFLICT (key) DO NOTHING;

-- 2. Update default value on affiliate_referrals to 0.1 so new signups automatically get the correct rate
ALTER TABLE public.affiliate_referrals ALTER COLUMN commission_percentage SET DEFAULT 0.1;

-- Update any existing referrals to ensure they are at 0.1
UPDATE public.affiliate_referrals SET commission_percentage = 0.1 WHERE commission_percentage != 0.1;

-- 3. Re-create the add_global_reward function to query partner_percentage 
-- (to align with the new nomenclature in Migration 111) while maintaining compatibility.
CREATE OR REPLACE FUNCTION public.add_global_reward(
    p_revenue_amount NUMERIC,
    p_currency TEXT,
    p_source_tx_id UUID
) RETURNS VOID AS $$
DECLARE
    v_reward_user_id UUID;
    v_reward_percentage NUMERIC;
    v_reward_amount NUMERIC;
    v_wallet_id UUID;
BEGIN
    -- Get reward configuration (Support both partner_percentage and global_reward_user_id)
    SELECT (value->>0)::UUID INTO v_reward_user_id FROM public.admin_settings WHERE key = 'global_reward_user_id';
    
    -- Try to get partner_percentage first, fallback to global_reward_percentage if not found
    SELECT (value->>0)::NUMERIC INTO v_reward_percentage FROM public.admin_settings WHERE key = 'partner_percentage';
    IF v_reward_percentage IS NULL THEN
        SELECT (value->>0)::NUMERIC INTO v_reward_percentage FROM public.admin_settings WHERE key = 'global_reward_percentage';
    END IF;

    IF v_reward_user_id IS NOT NULL AND v_reward_percentage IS NOT NULL THEN
        v_reward_amount := (p_revenue_amount * v_reward_percentage) / 100.0;

        IF v_reward_amount > 0 THEN
            -- Find reward user's wallet
            SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = v_reward_user_id AND currency = p_currency LIMIT 1;

            IF v_wallet_id IS NOT NULL THEN
                -- Credit wallet
                UPDATE public.wallets 
                SET balance = balance + v_reward_amount,
                    available_balance = available_balance + v_reward_amount
                WHERE id = v_wallet_id;

                -- Log transaction
                INSERT INTO public.transactions (wallet_id, type, amount, currency, status, reference_id, metadata)
                VALUES (v_wallet_id, 'GLOBAL_REWARD', v_reward_amount, p_currency, 'COMPLETED', p_source_tx_id::text, 
                        jsonb_build_object('source_revenue', p_revenue_amount));
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Set the partner fee reward to carlyantony4@gmail.com
DO $$
DECLARE
    v_partner_id UUID;
BEGIN
    -- Look up the UUID for the specified email
    -- Attempting to find in profiles
    SELECT id INTO v_partner_id FROM public.profiles WHERE email = 'carlyantony4@gmail.com' LIMIT 1;
    
    IF v_partner_id IS NOT NULL THEN
        UPDATE public.admin_settings SET value = to_jsonb(v_partner_id::text) WHERE key = 'global_reward_user_id';
        
        -- Insert if it didn't exist
        INSERT INTO public.admin_settings (key, value) VALUES ('global_reward_user_id', to_jsonb(v_partner_id::text)) ON CONFLICT (key) DO NOTHING;
    ELSE
        RAISE NOTICE 'Partner email carlyantony4@gmail.com not found. global_reward_user_id not updated.';
    END IF;
END $$;

COMMIT;
