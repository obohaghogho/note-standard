-- Migration 128: Fix Limit Requests Relationship
-- This adds the missing foreign key from limit_requests to profiles, 
-- which is required for PostgREST joins/embedding to work in the admin dashboard.

BEGIN;

-- 1. Ensure the foreign key exists and points to public.profiles
-- We use 'limit_requests_user_id_fkey' but many PostgREST versions 
-- prefer the table name as the alias if multiple FKs exist.
ALTER TABLE public.limit_requests
DROP CONSTRAINT IF EXISTS limit_requests_user_id_fkey,
ADD CONSTRAINT limit_requests_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;

-- 2. Grant permissions just in case
GRANT SELECT ON public.limit_requests TO authenticated;
GRANT SELECT ON public.limit_requests TO service_role;

-- 3. Reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
