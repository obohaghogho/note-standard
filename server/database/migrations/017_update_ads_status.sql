-- Migration to add 'pending_payment' to ads status check constraint

ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_status_check;

ALTER TABLE ads ADD CONSTRAINT ads_status_check 
CHECK (status IN ('pending', 'pending_payment', 'approved', 'rejected', 'paused'));
