-- Migration: 058_reduce_affiliate_commission.sql
-- Description: Reduce affiliate commission rate from 10% to 5%.

-- 1. Update Admin Settings
UPDATE admin_settings 
SET value = '5.0'::jsonb 
WHERE key = 'affiliate_percentage';

-- 2. Update affiliate_referrals table structure
ALTER TABLE affiliate_referrals 
ALTER COLUMN commission_percentage SET DEFAULT 5.0;

-- 3. Update existing referral records that were at 10%
-- This ensures all users now earn 5% instead of 10%
UPDATE affiliate_referrals 
SET commission_percentage = 5.0 
WHERE commission_percentage = 10.0;
