-- Migration: Add terms acceptance tracking to profiles table
-- This migration adds a timestamp column to track when users accepted the terms and conditions

-- Add terms_accepted_at column to profiles table
alter table profiles 
add column if not exists terms_accepted_at timestamp with time zone;

-- Grandfather existing users by setting their terms_accepted_at to their created_at date
update profiles 
set terms_accepted_at = created_at 
where terms_accepted_at is null;

-- Create index for performance
create index if not exists profiles_terms_accepted_at_idx on profiles(terms_accepted_at);

-- Add comment for documentation
comment on column profiles.terms_accepted_at is 'Timestamp when user accepted the Terms & Conditions';
