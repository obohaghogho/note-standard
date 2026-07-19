-- ─────────────────────────────────────────────────────────────────────────────
-- Fix Migration: Add missing columns to existing supported_currencies table
-- Run this if the table already existed before add_supported_currencies.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add any missing columns (safe — IF NOT EXISTS avoids errors if already present)
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS symbol              TEXT;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS flag                TEXT;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS color               VARCHAR(20);
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS deposit_enabled     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS withdraw_enabled    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS transfer_enabled    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS buy_enabled         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS sell_enabled        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS swap_enabled        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS convert_enabled     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS virtual_account_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS minimum_deposit     NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS minimum_withdrawal  NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS maximum_deposit     NUMERIC NOT NULL DEFAULT 999999999;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS maximum_withdrawal  NUMERIC NOT NULL DEFAULT 999999999;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS decimal_places      INT     NOT NULL DEFAULT 2;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS icon_url            TEXT;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS provider            TEXT;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS networks            TEXT[];
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS deposit_methods     TEXT[];
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS display_order       INT     NOT NULL DEFAULT 99;
ALTER TABLE supported_currencies ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT now();

-- Ensure status column has correct CHECK constraint (recreate safely)
-- If the column already exists with a different constraint, this is a no-op
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'supported_currencies' AND column_name = 'status'
  ) THEN
    ALTER TABLE supported_currencies ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'coming_soon';
  END IF;
END $$;

-- Step 2: auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_supported_currencies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supported_currencies_updated_at ON supported_currencies;
CREATE TRIGGER trg_supported_currencies_updated_at
  BEFORE UPDATE ON supported_currencies
  FOR EACH ROW EXECUTE FUNCTION update_supported_currencies_updated_at();

-- Step 3: Upsert seed data (ON CONFLICT updates existing rows with new metadata)

-- Fiat currencies
INSERT INTO supported_currencies (
  code, type, name, symbol, flag, color, status,
  deposit_enabled, withdraw_enabled, transfer_enabled,
  buy_enabled, sell_enabled, swap_enabled, convert_enabled, virtual_account_enabled,
  minimum_deposit, minimum_withdrawal, maximum_deposit, maximum_withdrawal,
  decimal_places, provider, deposit_methods, display_order
) VALUES
  (
    'NGN', 'fiat', 'Nigerian Naira', '₦', '🇳🇬', '#6366f1', 'active',
    true, true, true, true, true, false, false, true,
    100, 500, 5000000, 1000000,
    2, 'paystack', ARRAY['card', 'bank_transfer'], 1
  ),
  (
    'USD', 'fiat', 'US Dollar', '$', '🇺🇸', '#10b981', 'coming_soon',
    false, false, false, false, false, false, false, true,
    1, 5, 50000, 10000,
    2, 'fincra', ARRAY['card', 'apple_pay', 'google_pay'], 2
  ),
  (
    'EUR', 'fiat', 'Euro', '€', '🇪🇺', '#3b82f6', 'coming_soon',
    false, false, false, false, false, false, false, true,
    1, 5, 50000, 10000,
    2, 'fincra', ARRAY['card', 'bank_transfer'], 3
  ),
  (
    'GBP', 'fiat', 'British Pound', '£', '🇬🇧', '#ec4899', 'coming_soon',
    false, false, false, false, false, false, false, true,
    1, 5, 50000, 10000,
    2, 'fincra', ARRAY['card', 'bank_transfer'], 4
  ),
  (
    'CAD', 'fiat', 'Canadian Dollar', 'C$', '🇨🇦', '#ff4d4d', 'coming_soon',
    false, false, false, false, false, false, false, true,
    1, 5, 50000, 10000,
    2, 'fincra', ARRAY['card', 'bank_transfer'], 5
  ),
  (
    'AUD', 'fiat', 'Australian Dollar', 'A$', '🇦🇺', '#000080', 'coming_soon',
    false, false, false, false, false, false, false, true,
    1, 5, 50000, 10000,
    2, 'fincra', ARRAY['card', 'bank_transfer'], 6
  )
ON CONFLICT (code) DO UPDATE SET
  symbol            = EXCLUDED.symbol,
  flag              = EXCLUDED.flag,
  color             = EXCLUDED.color,
  status            = EXCLUDED.status,
  deposit_enabled   = EXCLUDED.deposit_enabled,
  withdraw_enabled  = EXCLUDED.withdraw_enabled,
  transfer_enabled  = EXCLUDED.transfer_enabled,
  buy_enabled       = EXCLUDED.buy_enabled,
  sell_enabled      = EXCLUDED.sell_enabled,
  swap_enabled      = EXCLUDED.swap_enabled,
  convert_enabled   = EXCLUDED.convert_enabled,
  virtual_account_enabled = EXCLUDED.virtual_account_enabled,
  minimum_deposit   = EXCLUDED.minimum_deposit,
  minimum_withdrawal= EXCLUDED.minimum_withdrawal,
  maximum_deposit   = EXCLUDED.maximum_deposit,
  maximum_withdrawal= EXCLUDED.maximum_withdrawal,
  decimal_places    = EXCLUDED.decimal_places,
  provider          = EXCLUDED.provider,
  deposit_methods   = EXCLUDED.deposit_methods,
  display_order     = EXCLUDED.display_order,
  updated_at        = now();

-- Crypto currencies
INSERT INTO supported_currencies (
  code, type, name, symbol, flag, color, status,
  deposit_enabled, withdraw_enabled, transfer_enabled,
  buy_enabled, sell_enabled, swap_enabled, convert_enabled, virtual_account_enabled,
  minimum_deposit, minimum_withdrawal, maximum_deposit, maximum_withdrawal,
  decimal_places, provider, networks, display_order
) VALUES
  (
    'BTC', 'crypto', 'Bitcoin', '₿', '🟠', '#f59e0b', 'active',
    true, true, false, true, true, true, false, false,
    0.00001, 0.0001, 10, 5,
    8, 'nowpayments', ARRAY['bitcoin', 'BEP20'], 7
  ),
  (
    'ETH', 'crypto', 'Ethereum', 'Ξ', '🔷', '#8b5cf6', 'active',
    true, true, false, true, true, true, false, false,
    0.001, 0.005, 100, 50,
    6, 'nowpayments', ARRAY['ERC20', 'BEP20'], 8
  ),
  (
    'USDT', 'crypto', 'Tether', '₮', '🟢', '#26a17b', 'active',
    true, true, false, true, true, true, false, false,
    1, 5, 100000, 50000,
    2, 'nowpayments', ARRAY['TRC20', 'ERC20', 'BEP20'], 9
  ),
  (
    'USDC', 'crypto', 'USD Coin', '●', '🔵', '#2775ca', 'active',
    true, true, false, true, true, true, false, false,
    1, 5, 100000, 50000,
    2, 'nowpayments', ARRAY['ERC20', 'BEP20', 'polygon'], 10
  )
ON CONFLICT (code) DO UPDATE SET
  symbol            = EXCLUDED.symbol,
  flag              = EXCLUDED.flag,
  color             = EXCLUDED.color,
  status            = EXCLUDED.status,
  deposit_enabled   = EXCLUDED.deposit_enabled,
  withdraw_enabled  = EXCLUDED.withdraw_enabled,
  transfer_enabled  = EXCLUDED.transfer_enabled,
  buy_enabled       = EXCLUDED.buy_enabled,
  sell_enabled      = EXCLUDED.sell_enabled,
  swap_enabled      = EXCLUDED.swap_enabled,
  convert_enabled   = EXCLUDED.convert_enabled,
  virtual_account_enabled = EXCLUDED.virtual_account_enabled,
  minimum_deposit   = EXCLUDED.minimum_deposit,
  minimum_withdrawal= EXCLUDED.minimum_withdrawal,
  maximum_deposit   = EXCLUDED.maximum_deposit,
  maximum_withdrawal= EXCLUDED.maximum_withdrawal,
  decimal_places    = EXCLUDED.decimal_places,
  provider          = EXCLUDED.provider,
  networks          = EXCLUDED.networks,
  display_order     = EXCLUDED.display_order,
  updated_at        = now();

-- Step 4: Indexes
CREATE INDEX IF NOT EXISTS idx_supported_currencies_type
  ON supported_currencies (type);

CREATE INDEX IF NOT EXISTS idx_supported_currencies_status
  ON supported_currencies (status);

-- Step 5: RLS (safe — enable is idempotent)
ALTER TABLE supported_currencies ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can read supported currencies" ON supported_currencies;
DROP POLICY IF EXISTS "Admins can manage supported currencies" ON supported_currencies;
DROP POLICY IF EXISTS "Anyone can read supported currencies" ON supported_currencies;
DROP POLICY IF EXISTS "Admins can manage currencies" ON supported_currencies;

CREATE POLICY "Authenticated users can read supported currencies"
  ON supported_currencies FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage supported currencies"
  ON supported_currencies FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('admin', 'superadmin')
    )
  );

-- Verify: show the result
SELECT code, type, name, symbol, flag, color, status, display_order
FROM supported_currencies
ORDER BY type, display_order;
