const supabase = require("../config/database");
const fxService = require("./fxService");
const feeService = require("./feeService");
const nowpaymentsProvider = require("../providers/nowpaymentsProvider");
const logger = require("../utils/logger");

/**
 * Swap Service
 * Responsible for calculating and executing swaps.
 */
class SwapService {
  /**
   * Calculate a time-locked swap quote
   */
  async calculateSwap(userId, fromCurrency, toCurrency, amount) {
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
        expires_at: new Date(Date.now() + 30000).toISOString(),
        metadata: {
          fee_breakdown: fees,
          calculated_at: new Date().toISOString(),
        },
      })
      .select().single();

    if (error) throw error;
    return { ...quote, lockId: quote.id };
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

    // Determine if Internal (Native to Native) or External (Cross-asset)
    const isInternal =
      (quote.from_currency === "USD" || quote.from_currency === "NGN") &&
      (quote.to_currency === "USD" || quote.to_currency === "NGN");

    if (isInternal) {
      const { data: txId, error: txError } = await supabase.rpc(
        "execute_production_swap",
        {
          p_quote_id: lockId,
          p_idempotency_key: idempotencyKey,
        },
      );

      if (txError) throw txError;
      return { success: true, transactionId: txId, amountOut: quote.to_amount };
    }

    // External Conversion Flow
    const internalReference = `swp_${Date.now()}_${userId.substring(0, 8)}`;
    const conversionResult = await nowpaymentsProvider.createConversion(
      quote.from_currency,
      quote.to_currency,
      quote.metadata.fee_breakdown.netAmount,
      internalReference,
    );

    const { data: txId, error: txError } = await supabase.rpc(
      "initiate_external_swap_intent",
      {
        p_from_wallet_id: quote.from_wallet_id,
        p_to_wallet_id: quote.to_wallet_id,
        p_gross_amount: quote.from_amount,
        p_fee_amount: quote.fee,
        p_quote_id: lockId,
        p_reference: internalReference,
        p_external_conversion_id: String(conversionResult.conversionId),
        p_provider: conversionResult.provider,
      },
    );

    if (txError) throw txError;

    // Record Fee Audit
    const fb = quote.metadata.fee_breakdown;
    await supabase.from("fees").insert({
      transaction_id: txId,
      admin_fee: fb.adminFee,
      partner_fee: fb.partnerAward,
      referral_fee: fb.referrerFee,
    });

    return { success: true, transactionId: txId, amountOut: quote.to_amount };
  }
}

module.exports = new SwapService();
