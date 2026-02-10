-- ====================================
-- CRYPTO WALLET SYSTEM
-- Secure Multi-Currency Wallet Schema
-- ====================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables to ensure clean slate (idempotent migration)
DROP TABLE IF EXISTS payment_methods CASCADE;
DROP TABLE IF EXISTS exchange_rates CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS wallet_keys CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;

-- ====================================
-- HELPER FUNCTIONS (Must be defined first)
-- ====================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ====================================
-- 1. WALLETS TABLE
-- Stores user balances for each currency
-- ====================================
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL, -- 'BTC', 'ETH', 'USDT', 'USD', 'NGN'
    balance NUMERIC(30, 18) DEFAULT 0 NOT NULL, -- Supports 18 decimals (ETH standard)
    address TEXT, -- Public chain address or internal ID
    is_frozen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure user has only one wallet per currency
    CONSTRAINT unique_user_currency UNIQUE (user_id, currency),
    -- Balance cannot be negative
    CONSTRAINT positive_balance CHECK (balance >= 0)
);

-- Index for fast lookups
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_currency ON wallets(currency);

-- Trigger to update updated_at
CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- 2. WALLET KEYS TABLE (SECURE)
-- Stores encrypted keys. strict RLS.
-- ====================================
CREATE TABLE wallet_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    encrypted_key TEXT NOT NULL, -- AES encrypted private key
    key_iv TEXT NOT NULL, -- Initialization Vector
    key_tag TEXT, -- Auth Tag for GCM
    derivation_path TEXT, -- HD Path
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_wallet_key UNIQUE (wallet_id)
);

-- ====================================
-- 3. TRANSACTIONS TABLE
-- Immutable ledger of all movements
-- ====================================
CREATE TABLE transactions ( 
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'BUY', 'SELL', 'SWAP'
    amount NUMERIC(30, 18) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'
    reference_id UUID, -- Links related transactions (e.g. sender -> receiver)
    external_hash TEXT, -- Blockchain Hash
    fee NUMERIC(30, 18) DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb, -- Sender info, exchange rate, payment method details
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_reference ON transactions(reference_id);

-- Trigger
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- 4. EXCHANGE RATES TABLE
-- ====================================
CREATE TABLE exchange_rates (
    pair VARCHAR(20) PRIMARY KEY, -- 'BTC-USD', 'ETH-USD'
    rate NUMERIC(30, 18) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================
-- 5. PAYMENT METHODS (Saved Cards/Banks)
-- ====================================
CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'CARD', 'BANK'
    provider VARCHAR(20) NOT NULL, -- 'STRIPE', 'PAYSTACK'
    last4 VARCHAR(4),
    token TEXT NOT NULL, -- Provider token (never raw card data)
    metadata JSONB DEFAULT '{}'::jsonb,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================
-- RLS POLICIES
-- ====================================

-- Enable RLS
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- WALLETS
-- Users can view their own wallets
CREATE POLICY "Users can view own wallets" ON wallets
    FOR SELECT USING (auth.uid() = user_id);

-- WALLET KEYS
-- NO ACCESS for standard authenticated users. Only Service Role.

-- TRANSACTIONS
-- Users can view their own transactions
CREATE POLICY "Users can view own transactions" ON transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM wallets 
            WHERE wallets.id = transactions.wallet_id 
            AND wallets.user_id = auth.uid()
        )
    );

-- PAYMENT METHODS
CREATE POLICY "Users can manage own payment methods" ON payment_methods
    FOR ALL USING (auth.uid() = user_id);

-- ====================================
-- REALTIME
-- ====================================
-- Add to Realtime publication (Safe Method)
DO $$
BEGIN
  -- Create publication if not exists (usually exists)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Add tables safely
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'wallets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'exchange_rates') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE exchange_rates;
  END IF;
END
$$;

-- ====================================
-- FUNCTIONS
-- ====================================

-- Safe Internal Transfer Function (Atomic)
CREATE OR REPLACE FUNCTION transfer_funds(
    p_sender_wallet_id UUID,
    p_receiver_wallet_id UUID,
    p_amount NUMERIC,
    p_currency VARCHAR,
    p_fee NUMERIC DEFAULT 0,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$ -- Returns Transaction ID of sender
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
BEGIN
    -- Check balance
    IF (SELECT balance FROM wallets WHERE id = p_sender_wallet_id) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;

    -- Generate reference ID for linking
    v_ref_id := uuid_generate_v4();

    -- Debit Sender
    UPDATE wallets 
    SET balance = balance - (p_amount + p_fee) 
    WHERE id = p_sender_wallet_id;

    -- Credit Receiver
    UPDATE wallets 
    SET balance = balance + p_amount 
    WHERE id = p_receiver_wallet_id;

    -- Record Sender Transaction
    INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_sender_wallet_id, 'TRANSFER_OUT', p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee, p_metadata)
    RETURNING id INTO v_tx_id;

    -- Record Receiver Transaction
    INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_receiver_wallet_id, 'TRANSFER_IN', p_amount, p_currency, 'COMPLETED', v_ref_id, 0, p_metadata);

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================
-- 5. WITHDRAW FUNDS FUNCTION (Atomic)
-- ====================================
CREATE OR REPLACE FUNCTION withdraw_funds(
    p_wallet_id UUID,
    p_amount DECIMAL,
    p_currency TEXT,
    p_fee DECIMAL,
    p_rate DECIMAL,
    p_platform_wallet_id UUID,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_ref_id UUID;
BEGIN
    -- Check balance
    IF (SELECT balance FROM wallets WHERE id = p_wallet_id) < (p_amount + p_fee) THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;

    v_ref_id := uuid_generate_v4();

    -- Debit User
    UPDATE wallets 
    SET balance = balance - (p_amount + p_fee) 
    WHERE id = p_wallet_id;

    -- Credit Platform (if fee exists and platform wallet provided)
    IF p_fee > 0 AND p_platform_wallet_id IS NOT NULL THEN
        UPDATE wallets 
        SET balance = balance + p_fee 
        WHERE id = p_platform_wallet_id;
    END IF;

    -- Record Transaction
    INSERT INTO transactions (wallet_id, type, amount, currency, status, reference_id, fee, metadata)
    VALUES (p_wallet_id, 'WITHDRAWAL', p_amount, p_currency, 'COMPLETED', v_ref_id, p_fee, p_metadata)
    RETURNING id INTO v_tx_id;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================
-- 6. CONFIRM DEPOSIT FUNCTION (Atomic)
-- ====================================
CREATE OR REPLACE FUNCTION confirm_deposit(
    p_transaction_id UUID,
    p_wallet_id UUID,
    p_amount DECIMAL,
    p_external_hash TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Only update if still pending
    IF (SELECT status FROM transactions WHERE id = p_transaction_id) != 'PENDING' THEN
        RETURN;
    END IF;

    -- Credit Wallet
    UPDATE wallets 
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Mark Transaction as Completed
    UPDATE transactions 
    SET status = 'COMPLETED',
        external_hash = p_external_hash,
        updated_at = NOW()
    WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
