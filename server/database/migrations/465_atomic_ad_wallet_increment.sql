-- Migration 465: Atomic Ad Wallet Increment RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates a Postgres function for atomically incrementing ad_wallet_balance
-- without a race-condition-prone read-modify-write cycle.
--
-- Called by PaymentService._creditAdWallet() to ensure two concurrent
-- finalization workers cannot double-credit the same user's ad wallet.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_ad_wallet(
  p_user_id UUID,
  p_amount   NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  UPDATE profiles
    SET ad_wallet_balance = COALESCE(ad_wallet_balance, 0) + p_amount
    WHERE id = p_user_id
  RETURNING ad_wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found in profiles', p_user_id;
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Grant access to the service role used by the API server
GRANT EXECUTE ON FUNCTION increment_ad_wallet(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION increment_ad_wallet(UUID, NUMERIC) TO authenticated;
