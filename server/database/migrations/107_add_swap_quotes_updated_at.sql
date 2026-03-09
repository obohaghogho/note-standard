-- Migration 107: Add missing updated_at column to swap_quotes
-- Both execute_production_swap and initiate_external_swap_intent RPCs
-- reference swap_quotes.updated_at, but the original table (migration 079)
-- only created 'created_at'.

ALTER TABLE public.swap_quotes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
