-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add supported_currencies table
-- NoteStandard Wallet Hub — Multi-Currency Catalog
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This table is the DB-first source of truth for currency status and
-- capabilities in the Wallet Hub. The application falls back to
-- server/config/walletCurrencyCatalog.js if this table is empty.
--
-- Admin operators can toggle currency status or adjust limits without code
-- deploys via the Admin Currency Management page at /admin/currencies.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supported_currencies (
  code                VARCHAR(10)  PRIMARY KEY,
  type                VARCHAR(10)  NOT NULL CHECK (type IN ('fiat', 'crypto')),
  name                TEXT         NOT NULL,
  symbol              TEXT,
  flag                TEXT,
  color               VARCHAR(20),
  status              VARCHAR(20)  NOT NULL DEFAULT 'coming_soon'
                      CHECK (status IN ('active', 'coming_soon', 'disabled')),
  deposit_enabled     BOOLEAN      NOT NULL DEFAULT false,
  withdraw_enabled    BOOLEAN      NOT NULL DEFAULT false,
  transfer_enabled    BOOLEAN      NOT NULL DEFAULT false,
  buy_enabled         BOOLEAN      NOT NULL DEFAULT false,
  sell_enabled        BOOLEAN      NOT NULL DEFAULT false,
  swap_enabled        BOOLEAN      NOT NULL DEFAULT false,
  convert_enabled     BOOLEAN      NOT NULL DEFAULT false,
  minimum_deposit     NUMERIC      NOT NULL DEFAULT 0,
  minimum_withdrawal  NUMERIC      NOT NULL DEFAULT 0,
  maximum_deposit     NUMERIC      NOT NULL DEFAULT 999999999,
  maximum_withdrawal  NUMERIC      NOT NULL DEFAULT 999999999,
  decimal_places      INT          NOT NULL DEFAULT 2,
  icon_url            TEXT,
  provider            TEXT,
  networks            TEXT[],
  deposit_methods     TEXT[],
  display_order       INT          NOT NULL DEFAULT 99,
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Trigger: auto-update updated_at ─────────────────────────────────────────
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

-- ── Seed: Fiat Currencies ────────────────────────────────────────────────────
INSERT INTO supported_currencies (
  code, type, name, symbol, flag, color, status,
  deposit_enabled, withdraw_enabled, transfer_enabled,
  buy_enabled, sell_enabled, swap_enabled, convert_enabled,
  minimum_deposit, minimum_withdrawal, maximum_deposit, maximum_withdrawal,
  decimal_places, provider, deposit_methods, display_order
) VALUES
  (
    'NGN', 'fiat', 'Nigerian Naira', '₦', '🇳🇬', '#6366f1', 'active',
    true, true, true, true, true, false, false,
    100, 500, 5000000, 1000000,
    2, 'paystack', ARRAY['card', 'bank_transfer'], 1
  ),
  (
    'USD', 'fiat', 'US Dollar', '$', '🇺🇸', '#10b981', 'coming_soon',
    false, false, false, false, false, false, false,
    1, 5, 50000, 10000,
    2, 'paystack_international', ARRAY['card', 'apple_pay', 'google_pay'], 2
  ),
  (
    'EUR', 'fiat', 'Euro', '€', '🇪🇺', '#3b82f6', 'coming_soon',
    false, false, false, false, false, false, false,
    1, 5, 50000, 10000,
    2, 'paystack_international', ARRAY['card', 'bank_transfer'], 3
  ),
  (
    'GBP', 'fiat', 'British Pound', '£', '🇬🇧', '#ec4899', 'coming_soon',
    false, false, false, false, false, false, false,
    1, 5, 50000, 10000,
    2, 'paystack_international', ARRAY['card', 'bank_transfer'], 4
  )
ON CONFLICT (code) DO NOTHING;

-- ── Seed: Crypto Currencies ──────────────────────────────────────────────────
INSERT INTO supported_currencies (
  code, type, name, symbol, flag, color, status,
  deposit_enabled, withdraw_enabled, transfer_enabled,
  buy_enabled, sell_enabled, swap_enabled, convert_enabled,
  minimum_deposit, minimum_withdrawal, maximum_deposit, maximum_withdrawal,
  decimal_places, provider, networks, display_order
) VALUES
  (
    'BTC', 'crypto', 'Bitcoin', '₿', '🟠', '#f59e0b', 'active',
    true, true, false, true, true, true, false,
    0.00001, 0.0001, 10, 5,
    8, 'nowpayments', ARRAY['bitcoin', 'BEP20'], 1
  ),
  (
    'ETH', 'crypto', 'Ethereum', 'Ξ', '🔷', '#8b5cf6', 'active',
    true, true, false, true, true, true, false,
    0.001, 0.005, 100, 50,
    6, 'nowpayments', ARRAY['ERC20', 'BEP20'], 2
  ),
  (
    'USDT', 'crypto', 'Tether', '₮', '🟢', '#26a17b', 'active',
    true, true, false, true, true, true, false,
    1, 5, 100000, 50000,
    2, 'nowpayments', ARRAY['TRC20', 'ERC20', 'BEP20'], 3
  ),
  (
    'USDC', 'crypto', 'USD Coin', '●', '🔵', '#2775ca', 'active',
    true, true, false, true, true, true, false,
    1, 5, 100000, 50000,
    2, 'nowpayments', ARRAY['ERC20', 'BEP20', 'polygon'], 4
  )
ON CONFLICT (code) DO NOTHING;

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE supported_currencies ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can READ the currency catalog
CREATE POLICY "Authenticated users can read supported currencies"
  ON supported_currencies
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins and superadmins can MODIFY the catalog
CREATE POLICY "Admins can manage supported currencies"
  ON supported_currencies
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('admin', 'superadmin')
    )
  );

-- ── Index ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supported_currencies_type
  ON supported_currencies (type);

CREATE INDEX IF NOT EXISTS idx_supported_currencies_status
  ON supported_currencies (status);
