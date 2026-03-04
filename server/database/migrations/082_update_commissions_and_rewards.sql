-- Migration 082: Commission & Reward Overhaul
-- Total Fee: 7.5% (0.075)
-- Distribution of that fee: 
--   6.666666667% to Referrer (results in 0.5% of volume)
--   13.333333333% to Global Reward User (results in 1% of volume)
--   Balance (80%) stays with Admin (results in 6% of volume)

-- Ensure defaults for all transaction types in commission_settings if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM commission_settings WHERE transaction_type = 'SWAP') THEN
        INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
        VALUES ('SWAP', 'PERCENTAGE', 0.075, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM commission_settings WHERE transaction_type = 'TRANSFER_OUT') THEN
        INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
        VALUES ('TRANSFER_OUT', 'PERCENTAGE', 0.075, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM commission_settings WHERE transaction_type = 'WITHDRAWAL') THEN
        INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
        VALUES ('WITHDRAWAL', 'PERCENTAGE', 0.075, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM commission_settings WHERE transaction_type = 'FUNDING') THEN
        INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
        VALUES ('FUNDING', 'PERCENTAGE', 0.075, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM commission_settings WHERE transaction_type = 'DEPOSIT') THEN
        INSERT INTO commission_settings (transaction_type, commission_type, value, is_active)
        VALUES ('DEPOSIT', 'PERCENTAGE', 0.075, true);
    END IF;
END $$;

-- Update all to 7.5%
UPDATE commission_settings 
SET value = 0.075 
WHERE transaction_type IN ('TRANSFER_OUT', 'WITHDRAWAL', 'SWAP', 'FUNDING', 'DEPOSIT');

UPDATE admin_settings 
SET value = '7.5'::jsonb 
WHERE key IN (
    'funding_fee_percentage', 
    'withdrawal_fee_percentage', 
    'spread_percentage'
);

-- 2. Update Affiliate Percentage (Percentage of the FEE)
-- Old: 10% (from 1% fee -> 0.1% volume) or whatever it was.
-- New: 0.5 / 7.5 * 100 = 6.666666667
UPDATE admin_settings 
SET value = '6.666666667'::jsonb 
WHERE key = 'affiliate_percentage';

-- Update existing referral records to the new percentage
UPDATE affiliate_referrals SET commission_percentage = 6.666666667;

-- 3. Add Global Reward Settings
INSERT INTO admin_settings (key, value) VALUES
('global_reward_percentage', '13.333333333'), -- 1.0 / 7.5 * 100
('global_reward_user_id', 'null'::jsonb)       -- To be filled by Admin later
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 4. Create Global Reward Function
CREATE OR REPLACE FUNCTION add_global_reward(
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
    -- Get reward configuration
    SELECT (value->>0)::UUID INTO v_reward_user_id FROM admin_settings WHERE key = 'global_reward_user_id';
    SELECT (value->>0)::NUMERIC INTO v_reward_percentage FROM admin_settings WHERE key = 'global_reward_percentage';

    IF v_reward_user_id IS NOT NULL AND v_reward_percentage IS NOT NULL THEN
        v_reward_amount := (p_revenue_amount * v_reward_percentage) / 100.0;

        IF v_reward_amount > 0 THEN
            -- Find reward user's wallet
            SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_reward_user_id AND currency = p_currency LIMIT 1;

            IF v_wallet_id IS NOT NULL THEN
                -- Credit wallet
                UPDATE wallets 
                SET balance = balance + v_reward_amount,
                    available_balance = available_balance + v_reward_amount
                WHERE id = v_wallet_id;

                -- Log transaction
                INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, metadata)
                VALUES (v_wallet_id, 'GLOBAL_REWARD', v_reward_amount, p_currency, 'COMPLETED', p_source_tx_id::text, 
                        jsonb_build_object('source_revenue', p_revenue_amount));
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
