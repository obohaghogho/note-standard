-- Migration 092: Database Architecture Alignment
-- Creates swaps and fees tables, and ensures wallet constraints.

BEGIN;

-- 1. SWAPS TABLE
CREATE TABLE IF NOT EXISTS public.swaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    from_currency VARCHAR(20) NOT NULL,
    to_currency VARCHAR(20) NOT NULL,
    from_amount NUMERIC(30,18) NOT NULL,
    to_amount NUMERIC(30,18) NOT NULL,
    rate NUMERIC(30,18) NOT NULL,
    fee NUMERIC(30,18) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swaps_user_id ON public.swaps(user_id);
CREATE INDEX IF NOT EXISTS idx_swaps_created_at ON public.swaps(created_at DESC);

-- 2. FEES TABLE
CREATE TABLE IF NOT EXISTS public.fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    admin_fee NUMERIC(30,18) DEFAULT 0,
    partner_fee NUMERIC(30,18) DEFAULT 0,
    referral_fee NUMERIC(30,18) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fees_transaction_id ON public.fees(transaction_id);

-- 3. WALLETS UNIQUE CONSTRAINT (Ensure)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_currency_network') THEN
        ALTER TABLE public.wallets_store ADD CONSTRAINT unique_user_currency_network UNIQUE (user_id, currency, network);
    END IF;
END $$;

-- 4. PROFILES ALIGNMENT (Ensure columns exist for views and swap logic)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES auth.users(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- 5. USERS AUDIT VIEW (Maps profiles to requested users schema)
-- Note: password is not stored in public.profiles. We use auth.users as the source of truth for email.
CREATE OR REPLACE VIEW public.v_users_audit AS
SELECT 
    id,
    email,
    '********' AS password, -- Do not expose actual passwords or their hashes
    referrer_id,
    created_at
FROM public.profiles;

COMMIT;
