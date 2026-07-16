-- Migration: 059_fix_affiliate_profiles_relationship.sql
-- Description: Fix missing relationships between affiliate_referrals and profiles for PostgREST joins.

-- 1. Fix relationship for referrer_user_id
ALTER TABLE affiliate_referrals
DROP CONSTRAINT IF EXISTS affiliate_referrals_referrer_profiles_fkey,
ADD CONSTRAINT affiliate_referrals_referrer_profiles_fkey
FOREIGN KEY (referrer_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 2. Fix relationship for referred_user_id
ALTER TABLE affiliate_referrals
DROP CONSTRAINT IF EXISTS affiliate_referrals_referred_profiles_fkey,
ADD CONSTRAINT affiliate_referrals_referred_profiles_fkey
FOREIGN KEY (referred_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
