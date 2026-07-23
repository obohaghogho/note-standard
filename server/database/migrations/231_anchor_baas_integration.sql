-- Migration 231: Anchor BaaS Integration Schema (Additive Only)
-- Purpose: Dedicated anchor_customers mapping table and customer status tracking

BEGIN;

CREATE TABLE IF NOT EXISTS public.anchor_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    anchor_customer_id TEXT NOT NULL UNIQUE,
    customer_type TEXT NOT NULL DEFAULT 'individual',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Enforce unique customer type per user
    CONSTRAINT unique_user_customer_type UNIQUE (user_id, customer_type)
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_anchor_customers_user_id ON public.anchor_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_anchor_customers_anchor_id ON public.anchor_customers(anchor_customer_id);

-- Enable Row-Level Security
ALTER TABLE public.anchor_customers ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own Anchor customer records
DROP POLICY IF EXISTS "Users can view their own Anchor customer records" ON public.anchor_customers;
CREATE POLICY "Users can view their own Anchor customer records" 
    ON public.anchor_customers FOR SELECT 
    USING (auth.uid() = user_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS set_anchor_customers_updated_at ON public.anchor_customers;
CREATE TRIGGER set_anchor_customers_updated_at
    BEFORE UPDATE ON public.anchor_customers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

COMMIT;
