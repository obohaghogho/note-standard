const supabase = require("../config/database");
const fxService = require("./fxService");
const feeService = require("./feeService");
const logger = require("../utils/logger");
const math = require("../utils/mathUtils");

/**
 * Swap Service (Hardened v5.4)
 * Responsible for calculating and executing swaps with backend price validation.
 */
class SwapService {
  /**
   * Calculate a time-locked swap quote
   */
  async calculateSwap(userId, fromCurrency, toCurrency, amount, slippage = 0.005) {
    const rateMeta = await fxService.getValidatedRate(fromCurrency, toCurrency);
    
    // Kernel Protection: Block quote generation if rates are unreliable
    if (!rateMeta.canExecute) {
      throw new Error(`Swap disabled: Pricing for ${fromCurrency}/${toCurrency} is currently ${rateMeta.mode}.`);
    }

    const marketPrice = rateMeta.rate;
    
    // Check if user has a referrer for conditional fee calculation
    const { data: profile } = await supabase
      .from("profiles")
      .select("referrer_id")
      .eq("id", userId)
      .single();
    const hasReferrer = !!profile?.referrer_id;

    const fees = feeService.calculateFees(amount, fromCurrency, hasReferrer);
    const amountOut = math.multiply(fees.netAmount, marketPrice);

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
          price_mode: rateMeta.mode
        },
      })
      .select().single();

    if (error) throw error;
    return {
      ...quote,
      lockId: quote.id,
      expiresAt: new Date(quote.expires_at).getTime(),
      feePercentage: math.multiply(math.divide(fees.totalFee, amount), 100),
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

    // Kernel Protection (The Sentinel): Independent Freshness check at execution time
    const currentRateMeta = await fxService.getValidatedRate(quote.from_currency, quote.to_currency, false); // No cache
    
    if (!currentRateMeta.canExecute) {
      logger.error(`[SwapService] Blocked stale execution for ${quote.from_currency}/${quote.to_currency}. Mode: ${currentRateMeta.mode}`);
      throw new Error(`Market volatility too high. Please get a fresh quote.`);
    }

    const currentRate = currentRateMeta.rate;
    const env = require("../config/env");

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

