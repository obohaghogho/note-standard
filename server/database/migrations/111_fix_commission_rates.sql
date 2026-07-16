-- Migration 111: Fix Commission Rates Synchronization
-- Ensures admin_settings and affiliate_referrals use the correct individual percentages
-- instead of relative shares or outdated 7.5% total rates.

BEGIN;

-- 1. Update individual admin settings to reflect the new 4.7% total structure
-- spread_percentage (Platform/Admin) = 4.5%
UPDATE public.admin_settings 
SET value = '4.5'::jsonb 
WHERE key = 'spread_percentage' OR key = 'funding_fee_percentage' OR key = 'withdrawal_fee_percentage';

-- affiliate_percentage (Referrer) = 0.1%
UPDATE public.admin_settings 
SET value = '0.1'::jsonb 
WHERE key = 'affiliate_percentage';

-- partner_percentage (Reward User) = 0.1%
UPDATE public.admin_settings 
SET value = '0.1'::jsonb 
WHERE key = 'partner_percentage';

-- 2. Correct affiliate_referrals table
-- If it was set to 6.666% (which was 0.5 / 7.5 * 100), reset it to the absolute 0.1%
UPDATE public.affiliate_referrals 
SET commission_percentage = 0.1
WHERE commission_percentage > 6.6 AND commission_percentage < 6.7;

-- 3. Update active commission_settings if they exist
UPDATE public.commission_settings
SET value = 4.5
WHERE commission_type = 'PERCENTAGE' AND (transaction_type = 'SWAP' OR transaction_type = 'WITHDRAWAL');

COMMIT;
