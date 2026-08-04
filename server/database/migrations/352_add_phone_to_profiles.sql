-- Migration 352: Add phone column to profiles
-- Purpose: Allow users to store their phone number for Tier 1 Verification

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

COMMIT;
