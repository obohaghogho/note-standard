-- Migration 081: HD Wallet Address Regeneration (REFINED)
-- Tracks derivation indices and status of generated crypto addresses

CREATE TABLE IF NOT EXISTS crypto_hd_indices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset VARCHAR(10) NOT NULL, -- 'BTC', 'ETH'
    next_index INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_asset_index UNIQUE (user_id, asset)
);

-- User requested table structure
CREATE TABLE IF NOT EXISTS crypto_hd_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  asset varchar(20) not null,
  address text not null,
  derivation_path text not null,
  address_index integer not null,
  status varchar(20) default 'unused',
  created_at timestamptz default now(),
  used_at timestamptz
);

-- Indices as requested by user
CREATE INDEX IF NOT EXISTS crypto_hd_addresses_user_id_idx ON public.crypto_hd_addresses(user_id);
CREATE INDEX IF NOT EXISTS crypto_hd_addresses_status_idx ON public.crypto_hd_addresses(status);
CREATE UNIQUE INDEX IF NOT EXISTS crypto_hd_addresses_asset_address_index_idx ON public.crypto_hd_addresses(asset, address_index);

-- Enable RLS
ALTER TABLE crypto_hd_indices ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_hd_addresses ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own HD indices') THEN
        CREATE POLICY "Users can view own HD indices" ON crypto_hd_indices
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own HD addresses') THEN
        CREATE POLICY "Users can view own HD addresses" ON crypto_hd_addresses
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END
$$;

-- Initialize indices for BTC and ETH for all existing users with wallets
INSERT INTO crypto_hd_indices (user_id, asset)
SELECT DISTINCT user_id, 'BTC' FROM wallets WHERE currency = 'BTC'
ON CONFLICT DO NOTHING;

INSERT INTO crypto_hd_indices (user_id, asset)
SELECT DISTINCT user_id, 'ETH' FROM wallets WHERE currency = 'ETH'
ON CONFLICT DO NOTHING;

-- Atomic function to get and increment the next address index
CREATE OR REPLACE FUNCTION get_and_increment_hd_index(
    p_user_id UUID,
    p_asset TEXT
) RETURNS INTEGER AS $$
DECLARE
    v_index INTEGER;
BEGIN
    INSERT INTO crypto_hd_indices (user_id, asset, next_index)
    VALUES (p_user_id, p_asset, 1)
    ON CONFLICT (user_id, asset) 
    DO UPDATE SET 
        next_index = crypto_hd_indices.next_index + 1,
        updated_at = NOW()
    RETURNING (crypto_hd_indices.next_index - 1) INTO v_index; -- Return the current (pre-increment) index
    
    RETURN v_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
