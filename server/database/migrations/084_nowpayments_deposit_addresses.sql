-- Migration 084: NOWPayments Deposit Address Cache
-- Stores deposit addresses issued by NOWPayments per user/asset.
-- These are safe addresses: crypto custody belongs to NOWPayments, NOT the platform.
-- The platform only reads them for display and tracks payment_id for IPN reconciliation.

CREATE TABLE IF NOT EXISTS nowpayments_deposit_addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset           VARCHAR(20) NOT NULL,           -- e.g. 'BTC', 'ETH', 'USDT'
    pay_currency    VARCHAR(20) NOT NULL,           -- NOWPayments pay_currency field
    address         TEXT NOT NULL,                 -- pay_address from NOWPayments
    payment_id      TEXT NOT NULL,                 -- NOWPayments payment_id for IPN reconciliation
    pay_amount      NUMERIC(24, 8),                -- expected amount (NULL = open deposit)
    status          VARCHAR(20) DEFAULT 'active',  -- 'active' | 'used' | 'expired'
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    used_at         TIMESTAMPTZ,

    CONSTRAINT unique_user_asset_active UNIQUE (user_id, asset, status)
        DEFERRABLE INITIALLY DEFERRED -- allows upsert: mark old 'active' as 'used' then insert new
);

-- Indices
CREATE INDEX IF NOT EXISTS nowpayments_addresses_user_id_idx ON nowpayments_deposit_addresses(user_id);
CREATE INDEX IF NOT EXISTS nowpayments_addresses_asset_idx   ON nowpayments_deposit_addresses(asset);
CREATE INDEX IF NOT EXISTS nowpayments_addresses_status_idx  ON nowpayments_deposit_addresses(status);

-- Enable RLS
ALTER TABLE nowpayments_deposit_addresses ENABLE ROW LEVEL SECURITY;

-- Policies: users can only see their own addresses
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'nowpayments_deposit_addresses'
          AND policyname = 'Users can view own nowpayments addresses'
    ) THEN
        CREATE POLICY "Users can view own nowpayments addresses"
            ON nowpayments_deposit_addresses
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END
$$;

-- Service role can do full CRUD (for backend operations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'nowpayments_deposit_addresses'
          AND policyname = 'Service role full access'
    ) THEN
        CREATE POLICY "Service role full access"
            ON nowpayments_deposit_addresses
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END
$$;
