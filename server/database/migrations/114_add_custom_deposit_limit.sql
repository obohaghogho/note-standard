-- Migration 114: Add Custom Deposit Limit
-- This allows admins to override global plan-based deposit limits for specific users.

BEGIN;

-- 1. Add custom limit column to profiles
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS daily_deposit_limit NUMERIC DEFAULT NULL;

-- 2. Create helper function for deposits (to match get_user_withdrawal_limit)
CREATE OR REPLACE FUNCTION public.get_user_deposit_limit(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_custom_limit NUMERIC;
    v_plan TEXT;
    v_plan_limits JSONB;
    v_limit NUMERIC;
BEGIN
    -- 1. Check for custom limit on profile
    SELECT daily_deposit_limit INTO v_custom_limit FROM public.profiles WHERE id = p_user_id;
    IF v_custom_limit IS NOT NULL THEN RETURN v_custom_limit; END IF;

    -- 2. Fallback to plan limits from admin_settings (using correct plan_tier column)
    SELECT plan_tier INTO v_plan FROM public.profiles WHERE id = p_user_id;
    SELECT value INTO v_plan_limits FROM public.admin_settings WHERE key = 'daily_limits';
    
    -- Extract limit for plan, fallback to 1000 if not specified
    v_limit := (v_plan_limits->>v_plan)::NUMERIC;
    RETURN COALESCE(v_limit, 1000); 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix existing get_user_withdrawal_limit (currently references non-existent 'plan' column)
CREATE OR REPLACE FUNCTION public.get_user_withdrawal_limit(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_custom_limit NUMERIC;
    v_plan TEXT;
    v_plan_limits JSONB;
    v_limit NUMERIC;
BEGIN
    -- 1. Check for custom limit on profile
    SELECT daily_withdrawal_limit INTO v_custom_limit FROM public.profiles WHERE id = p_user_id;
    IF v_custom_limit IS NOT NULL THEN RETURN v_custom_limit; END IF;

    -- 2. Fallback to plan limits from admin_settings (pointing to correct plan_tier)
    SELECT plan_tier INTO v_plan FROM public.profiles WHERE id = p_user_id;
    SELECT value INTO v_plan_limits FROM public.admin_settings WHERE key = 'daily_limits';
    
    v_limit := (v_plan_limits->>v_plan)::NUMERIC;
    RETURN COALESCE(v_limit, 1000); 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
