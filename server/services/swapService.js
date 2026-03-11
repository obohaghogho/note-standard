const supabase = require("../config/database");
const fxService = require("./fxService");
const feeService = require("./feeService");
const logger = require("../utils/logger");

/**
 * Swap Service
 * Responsible for calculating and executing swaps.
 */
class SwapService {
  /**
   * Calculate a time-locked swap quote
   */
  async calculateSwap(userId, fromCurrency, toCurrency, amount, slippage = 0.005) {
    const marketPrice = await fxService.getRate(fromCurrency, toCurrency);
    const fees = feeService.calculateFees(amount, fromCurrency);
    const amountOut = fees.netAmount * marketPrice;

    // Direct circular dependency fix if needed, but here we require within method
    const walletService = require("./walletService");
    const fromWallet = await walletService.createWallet(userId, fromCurrency);
    const toWallet = await walletService.createWallet(userId, toCurrency);

    const { data: quote, error } = await supabase
      .from("swap_quotes")
      .insert({
        user_id: userId,
        from_wallet_id: fromWallet.id,
        to_wallet_id: toWallet.id,
        from_amount: amount,
        to_amount: amountOut,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate: marketPrice,
        fee: fees.totalFee,
        slippage_tolerance: slippage,
        expires_at: new Date(Date.now() + 120000).toISOString(),
        metadata: {
          fee_breakdown: fees,
          calculated_at: new Date().toISOString(),
          requested_slippage: slippage,
        },
      })
      .select().single();

    if (error) throw error;
    return {
      ...quote,
      lockId: quote.id,
      expiresAt: new Date(quote.expires_at).getTime(),
      feePercentage: (fees.totalFee / amount) * 100,
      amountOut: amountOut,
    };
  }

  /**
   * Execute a swap (Internal Atomic or External conversion)
   */
  async executeSwap(userId, lockId, idempotencyKey) {
    const { data: quote, error: quoteError } = await supabase
      .from("swap_quotes")
      .select("*")
      .eq("id", lockId)
      .eq("status", "PENDING")
      .single();

    if (quoteError || !quote) {
      throw new Error("Quote expired or invalid.");
    }

    // All swaps use the atomic production swap RPC.
    // This is the standard approach used by Coinbase, Remitano, etc.:
    // The platform holds all balances internally, so swaps are instant
    // ledger transfers — debit source wallet, credit destination wallet,
    // distribute fees — all in a single atomic database transaction.
    const env = require("../config/env");
    // Verifying current market rate for slippage protection
    const currentRate = await fxService.getRate(quote.from_currency, quote.to_currency);

    const { data: txId, error: txError } = await supabase.rpc(
      "execute_production_swap",
      {
        p_quote_id: lockId,
        p_current_market_rate: currentRate,
        p_idempotency_key: idempotencyKey,
        p_admin_rate: env.ADMIN_FEE_RATE,
        p_partner_rate: env.PARTNER_FEE_RATE,
        p_referrer_rate: env.REFERRAL_FEE_RATE,
      },
    );

    if (txError) {
      logger.error(`[SwapService] RPC error: ${txError.message}`, {
        hint: txError.hint,
        details: txError.details,
        code: txError.code,
        quoteId: lockId,
      });
      throw txError;
    }

    return {
      success: true,
      transactionId: txId,
      fromCurrency: quote.from_currency,
      toCurrency: quote.to_currency,
      amountIn: quote.from_amount,
      amountOut: quote.to_amount,
      fee: quote.fee,
      rate: quote.rate,
    };
  }
}

module.exports = new SwapService();
