-- Migration 093: Automatic Wallet Creation
-- Enhances handle_new_user to create default wallets idempotently.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  -- 1. Create Profile (Existing)
  INSERT INTO public.profiles (id, email, username)
  VALUES (new.id, new.email, split_part(new.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create Default Wallets (New)
  -- Currencies: USD, BTC, ETH, USDT, USDC, NGN
  -- Using ON CONFLICT (user_id, currency, network) DO NOTHING for idempotency
  
  -- USD
  INSERT INTO public.wallets_store (user_id, currency, network, balance, address)
  VALUES (new.id, 'USD', 'native', 0, uuid_generate_v4()::text)
  ON CONFLICT (user_id, currency, network) DO NOTHING;

  -- BTC
  INSERT INTO public.wallets_store (user_id, currency, network, balance, address)
  VALUES (new.id, 'BTC', 'bitcoin', 0, uuid_generate_v4()::text)
  ON CONFLICT (user_id, currency, network) DO NOTHING;

  -- ETH
  INSERT INTO public.wallets_store (user_id, currency, network, balance, address)
  VALUES (new.id, 'ETH', 'ethereum', 0, uuid_generate_v4()::text)
  ON CONFLICT (user_id, currency, network) DO NOTHING;

  -- USDT
  INSERT INTO public.wallets_store (user_id, currency, network, balance, address)
  VALUES (new.id, 'USDT', 'TRC20', 0, uuid_generate_v4()::text)
  ON CONFLICT (user_id, currency, network) DO NOTHING;

  -- USDC
  INSERT INTO public.wallets_store (user_id, currency, network, balance, address)
  VALUES (new.id, 'USDC', 'ERC20', 0, uuid_generate_v4()::text)
  ON CONFLICT (user_id, currency, network) DO NOTHING;

  -- NGN
  INSERT INTO public.wallets_store (user_id, currency, network, balance, address)
  VALUES (new.id, 'NGN', 'native', 0, uuid_generate_v4()::text)
  ON CONFLICT (user_id, currency, network) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
