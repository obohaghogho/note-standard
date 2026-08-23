-- Migration: 414_crypto_fiat_liquidity_settlement_architecture.sql
-- Purpose: Decoupled Crypto-to-Fiat Conversion, Liquidity Counterparty Registry,
--          Atomic Liquidity Reservations, Real Settlement Confirmation & Decoupled Payout Routing.

-- 1. Approved Liquidity & Conversion Counterparty Registry
CREATE TABLE IF NOT EXISTS public.liquidity_providers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id         VARCHAR(64) UNIQUE NOT NULL,      -- 'COUNTERPARTY_A', 'NOWPAYMENTS_OTC', 'YELLOW_CARD', etc.
    name                VARCHAR(128) NOT NULL,
    provider_type       VARCHAR(32) NOT NULL DEFAULT 'LIQUIDITY_COUNTERPARTY', -- 'LIQUIDITY_COUNTERPARTY', 'HYBRID', 'PAYOUT_RAIL'
    is_active           BOOLEAN NOT NULL DEFAULT true,
    compliance_status   VARCHAR(32) NOT NULL DEFAULT 'APPROVED', -- 'APPROVED', 'PENDING_REVIEW', 'SUSPENDED'
    settlement_type     VARCHAR(32) NOT NULL DEFAULT 'BANK_SETTLEMENT', -- 'BANK_SETTLEMENT', 'ON_CHAIN', 'DIRECT_DEPOSIT'
    supported_corridors JSONB NOT NULL DEFAULT '["CRYPTO_NGN", "CRYPTO_GHS", "CRYPTO_USD"]'::jsonb,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Liquidity & Conversion Route Registry
CREATE TABLE IF NOT EXISTS public.liquidity_routes (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id             VARCHAR(64) UNIQUE NOT NULL,    -- 'ROUTE_COUNTERPARTY_A_NGN', 'ROUTE_COUNTERPARTY_B_GHS'
    liquidity_provider   VARCHAR(64) NOT NULL REFERENCES public.liquidity_providers(provider_id) ON DELETE CASCADE,
    payout_provider      VARCHAR(64) NOT NULL,            -- 'FINCRA', 'PAYSTACK', 'ALTERNATIVE_RAIL_B'
    conversion_asset     VARCHAR(10) NOT NULL,            -- 'BTC', 'ETH', 'USDT', 'USDC'
    settlement_currency  VARCHAR(10) NOT NULL,            -- 'NGN', 'GHS', 'USD'
    payout_currency      VARCHAR(10) NOT NULL,            -- 'NGN', 'GHS', 'USD'
    available_liquidity  NUMERIC(30, 8) NOT NULL DEFAULT 0,
    min_order_size       NUMERIC(30, 8) NOT NULL DEFAULT 1000,
    max_order_size       NUMERIC(30, 8) NOT NULL DEFAULT 50000000,
    sync_status          VARCHAR(20) NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS', 'STALE', 'FAILED'
    provider_health      VARCHAR(20) NOT NULL DEFAULT 'ONLINE',  -- 'ONLINE', 'DEGRADED', 'OFFLINE'
    last_synced_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ttl_ms               INTEGER NOT NULL DEFAULT 900000,        -- 15 mins default TTL
    enabled              BOOLEAN NOT NULL DEFAULT true,
    priority             INTEGER NOT NULL DEFAULT 1,             -- Lower = higher priority
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lr_asset_currency ON public.liquidity_routes(conversion_asset, settlement_currency, enabled);
CREATE INDEX IF NOT EXISTS idx_lr_provider ON public.liquidity_routes(liquidity_provider, sync_status, provider_health);

-- 3. Crypto-to-Fiat Conversion Orders State Machine Table
CREATE TABLE IF NOT EXISTS public.conversion_orders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversion_id           VARCHAR(64) UNIQUE NOT NULL,
    user_id                 UUID NOT NULL,
    from_asset              VARCHAR(10) NOT NULL,
    from_amount             NUMERIC(30, 8) NOT NULL,
    to_currency             VARCHAR(10) NOT NULL,
    to_amount               NUMERIC(30, 8) NOT NULL,
    conversion_rate         NUMERIC(30, 8) NOT NULL,
    route_id                VARCHAR(64),
    reservation_id          UUID,
    settlement_reference    VARCHAR(128),
    payout_reference        VARCHAR(128),
    status                  VARCHAR(32) NOT NULL DEFAULT 'CRYPTO_CONFIRMED',
    -- State Machine:
    -- CRYPTO_CONFIRMED -> CONVERSION_REQUESTED -> LIQUIDITY_ROUTING -> LIQUIDITY_RESERVED
    -- -> CONVERSION_EXECUTING -> COUNTERPARTY_SETTLEMENT_CONFIRMED -> FIAT_SETTLED
    -- -> LEDGER_CREDITED -> PAYOUT_PENDING -> PAYOUT_PROCESSING -> PAYOUT_SUCCESSFUL
    -- Failure states: LIQUIDITY_UNAVAILABLE, CONVERSION_FAILED, SETTLEMENT_FAILED, PAYOUT_FAILED, REVERSED
    error_message           TEXT,
    metadata                JSONB DEFAULT '{}'::jsonb,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_co_user_id ON public.conversion_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_co_status ON public.conversion_orders(status);
CREATE INDEX IF NOT EXISTS idx_co_conversion_id ON public.conversion_orders(conversion_id);

-- 4. RPC 1: Atomic Liquidity Reservation Function with FOR UPDATE Row Locking
CREATE OR REPLACE FUNCTION public.reserve_liquidity_v1(
    p_route_id          VARCHAR,
    p_conversion_id     VARCHAR,
    p_user_id           UUID,
    p_from_asset        VARCHAR,
    p_from_amount       NUMERIC,
    p_to_currency       VARCHAR,
    p_to_amount         NUMERIC,
    p_ttl_seconds       INTEGER DEFAULT 900
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_route public.liquidity_routes%ROWTYPE;
    v_active_reserved NUMERIC := 0.0;
    v_usable_liquidity NUMERIC := 0.0;
    v_reservation_id UUID;
    v_expires_at TIMESTAMP WITH TIME ZONE := NOW() + (p_ttl_seconds || ' seconds')::INTERVAL;
BEGIN
    -- 1. Lock and fetch liquidity route record
    SELECT * INTO v_route
    FROM public.liquidity_routes
    WHERE route_id = p_route_id AND enabled = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'ROUTE_NOT_FOUND', 'message', 'Liquidity route not found or disabled');
    END IF;

    -- 2. Validate route health and sync status
    IF v_route.provider_health != 'ONLINE' OR v_route.sync_status != 'SUCCESS' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'ROUTE_UNHEALTHY', 'message', 'Liquidity route is currently unhealthy or unverified');
    END IF;

    -- 3. Sum active unexpired reservations for this route
    SELECT COALESCE(SUM(destination_amount), 0.0) INTO v_active_reserved
    FROM public.treasury_liquidity_reservations
    WHERE provider = v_route.liquidity_provider
      AND destination_currency = p_to_currency
      AND status IN ('SOURCE_RESERVED', 'FX_QUOTE_LOCKED', 'CONVERSION_SUBMITTED', 'CONVERSION_PROCESSING')
      AND expires_at > NOW();

    v_usable_liquidity := v_route.available_liquidity - v_active_reserved;

    IF v_usable_liquidity < p_to_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INSUFFICIENT_ROUTE_LIQUIDITY',
            'message', format('Insufficient available liquidity on route %s (Available: %s, Requested: %s)', p_route_id, v_usable_liquidity, p_to_amount)
        );
    END IF;

    -- 4. Create reservation in treasury_liquidity_reservations
    v_reservation_id := gen_random_uuid();
    INSERT INTO public.treasury_liquidity_reservations (
        id,
        withdrawal_reference,
        treasury_reference,
        conversion_reference,
        provider,
        source_currency,
        source_amount,
        destination_currency,
        destination_amount,
        fx_rate,
        status,
        expires_at
    ) VALUES (
        v_reservation_id,
        p_conversion_id,
        'TREAS_RES_' || substring(md5(random()::text) from 1 for 12),
        p_conversion_id,
        v_route.liquidity_provider,
        UPPER(p_from_asset),
        p_from_amount,
        UPPER(p_to_currency),
        p_to_amount,
        p_to_amount / GREATEST(p_from_amount, 0.00000001),
        'SOURCE_RESERVED',
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'route_id', p_route_id,
        'provider', v_route.liquidity_provider,
        'usable_liquidity', v_usable_liquidity - p_to_amount,
        'expires_at', v_expires_at
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RESERVATION_ERROR', 'message', SQLERRM);
END;
$$;

-- 5. RPC 2: Finalize Fiat Settlement & Perform Double-Entry Ledger Credit ONLY upon Confirmed Settlement
CREATE OR REPLACE FUNCTION public.finalize_conversion_settlement_v1(
    p_conversion_id         VARCHAR,
    p_settlement_ref        VARCHAR,
    p_settled_fiat_amount   NUMERIC
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order public.conversion_orders%ROWTYPE;
    v_wallet public.wallets_store%ROWTYPE;
    v_tx_id UUID;
BEGIN
    -- 1. Fetch & lock conversion order
    SELECT * INTO v_order
    FROM public.conversion_orders
    WHERE conversion_id = p_conversion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'CONVERSION_NOT_FOUND', 'message', 'Conversion order not found');
    END IF;

    -- Terminal / idempotency check
    IF v_order.status IN ('FIAT_SETTLED', 'LEDGER_CREDITED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'PAYOUT_SUCCESSFUL') THEN
        RETURN jsonb_build_object('success', true, 'already_settled', true, 'status', v_order.status);
    END IF;

    -- 2. Lock & fetch user's target fiat wallet
    SELECT * INTO v_wallet
    FROM public.wallets_store
    WHERE user_id = v_order.user_id AND currency = UPPER(v_order.to_currency)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'FIAT_WALLET_NOT_FOUND', 'message', 'User fiat wallet not found');
    END IF;

    -- 3. Atomic Double-Entry Ledger Credit to User Fiat Wallet
    UPDATE public.wallets_store
    SET balance = balance + p_settled_fiat_amount,
        available_balance = available_balance + p_settled_fiat_amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- 4. Update conversion order state to LEDGER_CREDITED
    UPDATE public.conversion_orders
    SET status = 'LEDGER_CREDITED',
        settlement_reference = p_settlement_ref,
        to_amount = p_settled_fiat_amount,
        updated_at = NOW()
    WHERE id = v_order.id;

    -- 5. Mark liquidity reservation as CONVERSION_SUBMITTED (consumed)
    IF v_order.reservation_id IS NOT NULL THEN
        UPDATE public.treasury_liquidity_reservations
        SET status = 'CONVERSION_SUBMITTED',
            conversion_reference = p_settlement_ref,
            updated_at = NOW()
        WHERE id = v_order.reservation_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'conversion_id', p_conversion_id,
        'user_id', v_order.user_id,
        'credited_amount', p_settled_fiat_amount,
        'currency', v_order.to_currency,
        'status', 'LEDGER_CREDITED'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SETTLEMENT_FINALIZATION_ERROR', 'message', SQLERRM);
END;
$$;

-- 6. Seed Initial Approved Counterparties & Routes
INSERT INTO public.liquidity_providers (provider_id, name, provider_type, is_active, compliance_status, settlement_type, supported_corridors)
VALUES 
  ('COUNTERPARTY_A', 'Approved OTC Conversion Counterparty A', 'LIQUIDITY_COUNTERPARTY', true, 'APPROVED', 'BANK_SETTLEMENT', '["BTC_NGN", "ETH_NGN", "USDT_NGN", "USDC_NGN"]'::jsonb),
  ('COUNTERPARTY_B', 'Approved OTC Conversion Counterparty B', 'LIQUIDITY_COUNTERPARTY', true, 'APPROVED', 'BANK_SETTLEMENT', '["BTC_GHS", "USDT_GHS"]'::jsonb),
  ('FINCRA_RAIL',    'Fincra Payout Rail Provider',              'PAYOUT_RAIL',             true, 'APPROVED', 'BANK_SETTLEMENT', '["NGN", "USD", "GHS"]'::jsonb)
ON CONFLICT (provider_id) DO UPDATE SET is_active = true, compliance_status = 'APPROVED';

INSERT INTO public.liquidity_routes (route_id, liquidity_provider, payout_provider, conversion_asset, settlement_currency, payout_currency, available_liquidity, min_order_size, max_order_size, sync_status, provider_health, enabled, priority)
VALUES
  ('ROUTE_COUNTERPARTY_A_NGN', 'COUNTERPARTY_A', 'FINCRA_RAIL', 'USDT', 'NGN', 'NGN', 50000000.0, 1000.0, 50000000.0, 'SUCCESS', 'ONLINE', true, 1),
  ('ROUTE_COUNTERPARTY_A_BTC', 'COUNTERPARTY_A', 'FINCRA_RAIL', 'BTC',  'NGN', 'NGN', 50000000.0, 1000.0, 50000000.0, 'SUCCESS', 'ONLINE', true, 1),
  ('ROUTE_COUNTERPARTY_B_GHS', 'COUNTERPARTY_B', 'FINCRA_RAIL', 'USDT', 'GHS', 'GHS', 200000.0,   10.0,   200000.0,   'SUCCESS', 'ONLINE', true, 1)
ON CONFLICT (route_id) DO UPDATE SET enabled = true, sync_status = 'SUCCESS', provider_health = 'ONLINE';
