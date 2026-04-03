-- Migration 127: Create Limit Requests Table
-- This table allows users to request custom daily deposit limits and administrators to manage them.

BEGIN;

CREATE TABLE IF NOT EXISTS public.limit_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requested_limit NUMERIC NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.limit_requests ENABLE ROW LEVEL SECURITY;

-- 1. Users can view their own requests
CREATE POLICY "Users can view their own limit requests" 
    ON public.limit_requests FOR SELECT 
    USING (auth.uid() = user_id);

-- 2. Users can insert their own requests (limit to 1 pending request at a time via app logic or trigger)
CREATE POLICY "Users can create their own limit requests" 
    ON public.limit_requests FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- 3. Admins can manage all requests
CREATE POLICY "Admins can manage all limit requests" 
    ON public.limit_requests FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'support')));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_limit_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_limit_request_updated
    BEFORE UPDATE ON public.limit_requests
    FOR EACH ROW EXECUTE PROCEDURE update_limit_requests_updated_at();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
