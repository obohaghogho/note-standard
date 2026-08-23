-- Migration: 413_corporate_treasury_liquidity_reservations.sql
-- Purpose: Enterprise Corporate Treasury Liquidity Reservations, FX Quote Correlations, and Atomic Locks

CREATE TABLE IF NOT EXISTS public.treasury_liquidity_reservations (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    withdrawal_reference   VARCHAR(64) NOT NULL,
    treasury_reference     VARCHAR(64) UNIQUE NOT NULL,
    quote_reference        VARCHAR(128),
    conversion_reference   VARCHAR(128),
    payout_reference       VARCHAR(128),
    provider               VARCHAR(32) NOT NULL DEFAULT 'fincra',
    source_currency        VARCHAR(10) NOT NULL,
    source_amount          NUMERIC(20, 8) NOT NULL,
    destination_currency   VARCHAR(10) NOT NULL,
    destination_amount     NUMERIC(20, 8) NOT NULL,
    fx_rate                NUMERIC(20, 8) NOT NULL DEFAULT 1.0,
    provider_fee           NUMERIC(20, 8) NOT NULL DEFAULT 0.0,
    spread_amount          NUMERIC(20, 8) NOT NULL DEFAULT 0.0,
    status                 VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    error_code             VARCHAR(64),
    error_message          TEXT,
    metadata               JSONB DEFAULT '{}'::jsonb,
    expires_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for lightning fast correlation lookups & concurrency checks
CREATE INDEX IF NOT EXISTS idx_tlr_withdrawal_ref ON public.treasury_liquidity_reservations(withdrawal_reference);
CREATE INDEX IF NOT EXISTS idx_tlr_treasury_ref   ON public.treasury_liquidity_reservations(treasury_reference);
CREATE INDEX IF NOT EXISTS idx_tlr_conversion_ref ON public.treasury_liquidity_reservations(conversion_reference);
CREATE INDEX IF NOT EXISTS idx_tlr_status_provider ON public.treasury_liquidity_reservations(provider, source_currency, status);
CREATE INDEX IF NOT EXISTS idx_tlr_expires_at     ON public.treasury_liquidity_reservations(expires_at);

-- RPC 1: Atomically Calculate & Reserve Corporate Treasury Liquidity
CREATE OR REPLACE FUNCTION public.reserve_corporate_treasury_liquidity(
    p_withdrawal_ref     VARCHAR,
    p_treasury_ref       VARCHAR,
    p_provider           VARCHAR,
    p_source_currency    VARCHAR,
    p_source_amount      NUMERIC,
    p_dest_currency      VARCHAR,
    p_dest_amount        NUMERIC,
    p_fx_rate            NUMERIC,
    p_provider_fee       NUMERIC,
    p_spread_amount      NUMERIC,
    p_ttl_seconds        INTEGER DEFAULT 300
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_active_reserved NUMERIC := 0.0;
    v_expires_at TIMESTAMP WITH TIME ZONE := NOW() + (p_ttl_seconds || ' seconds')::INTERVAL;
BEGIN
    -- Sum all active, unexpired reservations for this provider & source_currency
    SELECT COALESCE(SUM(source_amount), 0.0) INTO v_active_reserved
    FROM public.treasury_liquidity_reservations
    WHERE provider = p_provider
      AND source_currency = p_source_currency
      AND status IN ('SOURCE_RESERVED', 'FX_QUOTE_LOCKED', 'CONVERSION_SUBMITTED', 'CONVERSION_PROCESSING')
      AND expires_at > NOW();

    -- Insert new reservation record
    INSERT INTO public.treasury_liquidity_reservations (
        withdrawal_reference,
        treasury_reference,
        provider,
        source_currency,
        source_amount,
        destination_currency,
        destination_amount,
        fx_rate,
        provider_fee,
        spread_amount,
        status,
        expires_at
    ) VALUES (
        p_withdrawal_ref,
        p_treasury_ref,
        p_provider,
        UPPER(p_source_currency),
        p_source_amount,
        UPPER(p_dest_currency),
        p_dest_amount,
        p_fx_rate,
        p_provider_fee,
        p_spread_amount,
        'SOURCE_RESERVED',
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'treasury_reference', p_treasury_ref,
        'total_active_reserved', v_active_reserved + p_source_amount,
        'expires_at', v_expires_at
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- RPC 2: Update Treasury Reservation State Atomically
CREATE OR REPLACE FUNCTION public.update_treasury_reservation_status(
    p_treasury_ref         VARCHAR,
    p_status               VARCHAR,
    p_quote_ref            VARCHAR DEFAULT NULL,
    p_conversion_ref       VARCHAR DEFAULT NULL,
    p_payout_ref           VARCHAR DEFAULT NULL,
    p_error_code           VARCHAR DEFAULT NULL,
    p_error_message        TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_res RECORD;
BEGIN
    SELECT * INTO v_res
    FROM public.treasury_liquidity_reservations
    WHERE treasury_reference = p_treasury_ref
    FOR UPDATE;

    IF v_res.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Treasury reservation not found');
    END IF;

    UPDATE public.treasury_liquidity_reservations
    SET status               = p_status,
        quote_reference      = COALESCE(p_quote_ref, quote_reference),
        conversion_reference = COALESCE(p_conversion_ref, conversion_reference),
        payout_reference     = COALESCE(p_payout_ref, payout_reference),
        error_code           = COALESCE(p_error_code, error_code),
        error_message        = COALESCE(p_error_message, error_message),
        updated_at           = NOW()
    WHERE treasury_reference = p_treasury_ref;

    RETURN jsonb_build_object('success', true, 'status', p_status, 'treasury_reference', p_treasury_ref);
END;
$$;
