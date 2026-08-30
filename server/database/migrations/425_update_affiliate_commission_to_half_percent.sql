-- Migration 425: Update Affiliate Referral Commission Rate to 0.5%

BEGIN;

-- 1. Update admin_settings to set affiliate_percentage to 0.5%
UPDATE public.admin_settings SET value = '0.5'::jsonb WHERE key = 'affiliate_percentage';
INSERT INTO public.admin_settings (key, value) VALUES ('affiliate_percentage', '0.5'::jsonb) ON CONFLICT (key) DO NOTHING;

-- 2. Update default commission_percentage on affiliate_referrals to 0.5
ALTER TABLE public.affiliate_referrals ALTER COLUMN commission_percentage SET DEFAULT 0.5;

-- 3. Update existing records in affiliate_referrals to 0.5
UPDATE public.affiliate_referrals SET commission_percentage = 0.5;

COMMIT;
