-- Fix Ads Status Constraint
-- Uses a DO block to find and drop ANY constraint on the status column, regardless of name.

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop checks on the status column
    FOR r IN SELECT constraint_name
             FROM information_schema.constraint_column_usage
             WHERE table_name = 'ads' AND column_name = 'status'
    LOOP
        EXECUTE 'ALTER TABLE ads DROP CONSTRAINT "' || r.constraint_name || '"';
    END LOOP;
END $$;

-- Add the correct constraint
ALTER TABLE ads ADD CONSTRAINT ads_status_check 
CHECK (status IN ('pending', 'pending_payment', 'approved', 'rejected', 'paused'));
