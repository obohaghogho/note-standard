-- Migration: Add FX columns and ensure transactions table exists
-- Date: 2026-02-10

-- Ensure transactions table exists (if not created by previous migrations)
CREATE TABLE IF NOT EXISTS transactions (
  id uuid default uuid_generate_v4() primary key,
  wallet_id uuid, -- assumed to reference wallets(id)
  type text,
  amount numeric,
  currency text,
  status text,
  reference_id text,
  fee numeric default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add columns to subscriptions
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS charged_amount_ngn numeric,
ADD COLUMN IF NOT EXISTS exchange_rate numeric;

-- Add columns to transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS charged_amount_ngn numeric,
ADD COLUMN IF NOT EXISTS exchange_rate numeric;
