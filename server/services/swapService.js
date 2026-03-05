const supabase = require("../config/supabase");
const { v4: uuidv4 } = require("uuid");
const fxService = require("./fxService");
const commissionService = require("./commissionService");
const payoutService = require("./payment/payoutService"); // NEW: For external conversions
const logger = require("../utils/logger");
const mathUtils = require("../utils/mathUtils");

// Rate Lock Cache: Stores quoted rates for 30 seconds
const rateLocks = new Map();
const LOCK_EXPIRY_MS = 30 * 1000; // 30 seconds

/**
 * Get all available exchange rates
 */
async function getAllExchangeRates() {
  const currencies = ["BTC", "ETH", "USD", "NGN", "EUR", "GBP"];
  const rates = {};

  for (const from of currencies) {
    rates[from] = {};
    for (const to of currencies) {
      if (from !== to) {
        rates[from][to] = await fxService.getRate(from, to);
      }
    }
  }

  return rates;
}

/**
 * Calculate swap preview (Locked for 30 seconds)
 */
async function calculateSwapPreview(
  userId,
  fromCurrency,
  toCurrency,
  amount,
  userPlan = "FREE",
  slippageTolerance = 0.005, // 0.5% default
  fromNetwork = "native",
  toNetwork = "native",
) {
  try {
    console.log(
      `[SwapService] Preview request: ${amount} ${fromCurrency} -> ${toCurrency} (${userPlan})`,
    );

    // REQUIREMENT: Integrated real pricing (NOWPayments Estimate preferred)
    const marketPrice = await fxService.getRate(
      fromCurrency,
      toCurrency,
      false,
      fromNetwork,
      toNetwork,
    );
    if (!marketPrice || marketPrice <= 0) {
      throw new Error(
        `Could not fetch reliable rate for ${fromCurrency}/${toCurrency}. Swapping is temporarily unavailable.`,
      );
    }

    const spreadResult = await commissionService.calculateSpread(
      "SELL",
      marketPrice,
      userPlan,
    );

    const finalPrice = spreadResult.finalPrice;
    const spreadAmountInQuote = spreadResult.spreadAmount * amount;

    // INCLUSIVE FEE MODEL
    // Fees are deducted FROM the amount entered by the user
    const grossAmount = amount;
    const totalFeeRate = 0.075; // 7.5% total (6% admin, 0.5% ref, 1% reward)

    // Use mathUtils to ensure precision
    const totalFeePrecise = mathUtils.multiply(grossAmount, totalFeeRate);
    const netAmountPrecise = parseFloat(grossAmount) -
      parseFloat(totalFeePrecise);

    const totalFee = parseFloat(
      mathUtils.formatForCurrency(totalFeePrecise, fromCurrency),
    );
    const netAmount = parseFloat(
      mathUtils.formatForCurrency(netAmountPrecise, fromCurrency),
    );
    const totalDebit = grossAmount; // What actually leaves the user's wallet

    // The net amount is what gets converted to the target currency
    const preciseAmountOut = mathUtils.multiply(netAmount, finalPrice);

    // Format output with correct decimal precision
    const formattedAmountOut = mathUtils.formatForCurrency(
      parseFloat(preciseAmountOut),
      toCurrency,
    );

    console.log(
      `[SwapService] Preview (Inclusive): Gross: ${grossAmount}, Fee: ${totalFee}, Net to Swap: ${netAmount} ${fromCurrency}. Output: ${formattedAmountOut} ${toCurrency}`,
    );

    // REQUIREMENT: Min Swap Limit Check
    const minSwap = 1; // E.g., at least 1 USD/EUR equivalent
    if (amount < minSwap) {
      throw new Error(`Minimum swap amount is ${minSwap} ${fromCurrency}`);
    }

    // REQUIREMENT: Ensure both wallets exist to get valid IDs
    const getOrCreateWallet = async (currency, network) => {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("id")
        .eq("currency", currency)
        .eq("network", network)
        .eq("user_id", userId)
        .maybeSingle();

      if (wallet) return wallet.id;

      const { data: newWallet, error: createErr } = await supabase
        .from("wallets")
        .insert({ user_id: userId, currency, network, address: uuidv4() })
        .select("id")
        .single();

      if (createErr) throw createErr;
      return newWallet.id;
    };

    const fromWalletId = await getOrCreateWallet(fromCurrency, fromNetwork);
    const toWalletId = await getOrCreateWallet(toCurrency, toNetwork);

    // REQUIREMENT: Lock rate for 30 seconds (Persistently in DB)
    const { data: quote, error: quoteError } = await supabase
      .from("swap_quotes")
      .insert({
        user_id: userId,
        from_wallet_id: fromWalletId,
        to_wallet_id: toWalletId,
        from_amount: amount,
        to_amount: formattedAmountOut,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate: finalPrice,
        fee: totalFee,
        slippage_tolerance: slippageTolerance,
        expires_at: new Date(Date.now() + LOCK_EXPIRY_MS).toISOString(),
        metadata: {
          market_price: spreadResult.marketPrice,
          spread_percentage: spreadResult.spreadPercentage,
          user_plan: userPlan,
          fee_model: "inclusive",
          fee_breakdown: {
            total_fee_percentage: 7.5,
            admin_fee_percentage: 6.0,
            referrer_fee_percentage: 0.5,
            reward_user_fee_percentage: 1.0,
            gross_amount: amount,
            net_swap_amount: amount -
              parseFloat(
                mathUtils.formatForCurrency(
                  mathUtils.multiply(amount, 0.075),
                  fromCurrency,
                ),
              ),
            fee_amount: parseFloat(
              mathUtils.formatForCurrency(
                mathUtils.multiply(amount, 0.075),
                fromCurrency,
              ),
            ),
            total_debit: amount,
          },
        },
      })
      .select()
      .single();

    if (quoteError || !quote) {
      throw new Error(`Failed to create swap quote: ${quoteError?.message}`);
    }

    return {
      ...quote,
      lockId: quote.id, // Compatibility with client
      totalDebit: totalDebit,
      netAmount: amount, // For backward compatibility if needed
    };
  } catch (err) {
    console.error("[SwapService] Preview Error:", err);
    throw err;
  }
}

/**
 * Execute a swap between two currencies
 */
async function executeSwap(
  userId,
  fromCurrency,
  toCurrency,
  amount,
  idempotencyKey = null,
  userPlan = "FREE",
  lockId = null,
  slippageTolerance = 0.005,
  fromNetwork = "native",
  toNetwork = "native",
) {
  let preview;

  if (lockId) {
    const { data: lockedPreview, error: quoteError } = await supabase
      .from("swap_quotes")
      .select("*")
      .eq("id", lockId)
      .single();

    if (quoteError || !lockedPreview) {
      throw new Error("Rate lock expired or invalid. Please refresh price.");
    }

    if (lockedPreview.status !== "PENDING") {
      throw new Error(`Quote already ${lockedPreview.status.toLowerCase()}.`);
    }

    preview = {
      to_amount: lockedPreview.to_amount,
      fee: parseFloat(lockedPreview.fee),
      rate: parseFloat(lockedPreview.rate),
      metadata: lockedPreview.metadata,
      from_wallet_id: lockedPreview.from_wallet_id,
      to_wallet_id: lockedPreview.to_wallet_id,
    };
  } else {
    preview = await calculateSwapPreview(
      userId,
      fromCurrency,
      toCurrency,
      amount,
      userPlan,
      slippageTolerance,
      fromNetwork,
      toNetwork,
    );
    lockId = preview.lockId;
  }

  const grossAmount = amount; // The amount user submitted (e.g., $100)
  const feeAmount = preview.fee ||
    parseFloat(
      mathUtils.formatForCurrency(
        mathUtils.multiply(grossAmount, 0.075),
        fromCurrency,
      ),
    );

  // In inclusive model, total debit is the gross amount, and we swap the net amount
  const totalDebit = grossAmount;
  const netSwapAmount = parseFloat(
    mathUtils.formatForCurrency(
      parseFloat(grossAmount) - parseFloat(feeAmount),
      fromCurrency,
    ),
  );

  // Check for duplicate request
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("transactions")
      .select("id")
      .or(
        `metadata->>'idempotency_key'.eq.${idempotencyKey},metadata->>'idempotencyKey'.eq.${idempotencyKey}`,
      )
      .maybeSingle();

    if (existing) throw new Error("Duplicate swap request");
  }

  const internalReference = `swp_${Date.now()}_${userId.substring(0, 8)}`;

  let conversionResult;
  try {
    conversionResult = await payoutService.createNowPaymentsConversion(
      fromCurrency,
      toCurrency,
      netSwapAmount, // Convert the NET amount ($92.50)
      internalReference,
      fromNetwork,
      toNetwork,
    );
  } catch (providerError) {
    throw new Error(`Provider Error: ${providerError.message}`);
  }

  const { data: txId, error: txError } = await supabase.rpc(
    "initiate_external_swap_intent",
    {
      p_from_wallet_id: preview.from_wallet_id,
      p_to_wallet_id: preview.to_wallet_id,
      p_gross_amount: grossAmount, // The full $100
      p_fee_amount: feeAmount, // The $7.50
      p_quote_id: lockId,
      p_reference: internalReference,
      p_external_conversion_id: String(conversionResult.conversionId),
      p_provider: conversionResult.provider || "NOWPAYMENTS",
    },
  );

  if (txError) {
    logger.error("Swap Intent Recording Failed", {
      error: txError.message,
      userId,
    });
    throw new Error(txError.message || "Swap execution failed");
  }

  // Update transaction with detailed fee breakdown for auditing
  await supabase.from("transactions")
    .update({
      metadata: {
        ...preview.metadata,
        total_debit: totalDebit,
        base_amount: grossAmount,
        net_swap_amount: netSwapAmount,
        fee_amount: feeAmount,
        external_reference: conversionResult.conversionId,
        provider_status: conversionResult.status,
      },
    })
    .eq("id", txId);

  try {
    const { createNotification } = require("./notificationService");
    await createNotification({
      receiverId: userId,
      type: "wallet_swap",
      title: "Swap Initiated",
      message:
        `Successfully initiated swap of ${grossAmount} ${fromCurrency} (Net: ${netSwapAmount} after ${feeAmount} fee).`,
      link: "/dashboard/wallet",
    });
  } catch (nErr) {
    logger.warn("Failed to send swap notification", { error: nErr.message });
  }

  return {
    success: true,
    transactionId: txId,
    fromCurrency,
    toCurrency,
    amountIn: grossAmount,
    amountOut: preview.to_amount,
    fee: feeAmount,
    totalDebit: totalDebit,
    rate: preview.rate,
    status: conversionResult.status || "processing",
  };
}

module.exports = {
  getAllExchangeRates,
  calculateSwapPreview,
  executeSwap,
};
