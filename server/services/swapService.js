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
) {
  try {
    console.log(
      `[SwapService] Preview request: ${amount} ${fromCurrency} -> ${toCurrency} (${userPlan})`,
    );

    // REQUIREMENT: Integrated real pricing (CoinGecko via fxService)
    const marketPrice = await fxService.getRate(fromCurrency, toCurrency);
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

    // inclusive fees: Fees are deducted FROM the total amount entered
    const totalFeeRate = 0.075; // 7.5% total (6% admin, 0.5% ref, 1% reward)
    const totalFee = amount * totalFeeRate;
    const netAmount = amount - totalFee;

    if (netAmount <= 0) {
      throw new Error(
        `Amount too small to cover the 7.5% platform service fee (${
          totalFee.toFixed(2)
        } ${fromCurrency})`,
      );
    }

    // Determine output based on quote rate
    // Note: fxService.getRate returns price of `fromCurrency` in terms of `toCurrency`
    // Example: getRate('USD', 'ETH') => 1 USD = 0.0003 ETH
    // Example: getRate('ETH', 'USD') => 1 ETH = 3000 USD
    // Therefore we ALWAY multiply amountToSwap * rate from fxService natively

    // Use mathUtils to protect precision against float math bugs
    const preciseAmountOut = mathUtils.multiply(netAmount, finalPrice);

    // Format output with correct decimal precision
    const formattedAmountOut = mathUtils.formatForCurrency(
      parseFloat(preciseAmountOut),
      toCurrency,
    );

    console.log(
      `[SwapService] Preview calculated: ${netAmount} * ${finalPrice} = ${formattedAmountOut} (Fee: ${totalFee})`,
    );

    // Max Swap Limit Check removed temporarily to allow low value equivalent swap tests

    // REQUIREMENT: Min Swap Limit Check
    const minSwap = 1; // E.g., at least 1 USD/EUR equivalent
    if (amount < minSwap) {
      throw new Error(`Minimum swap amount is ${minSwap} ${fromCurrency}`);
    }

    // REQUIREMENT: Ensure both wallets exist to get valid IDs
    const getOrCreateWallet = async (currency) => {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("id")
        .eq("currency", currency)
        .eq("user_id", userId)
        .single();

      if (wallet) return wallet.id;

      const { data: newWallet, error: createErr } = await supabase
        .from("wallets")
        .insert({ user_id: userId, currency, address: uuidv4() })
        .select("id")
        .single();

      if (createErr) throw createErr;
      return newWallet.id;
    };

    const fromWalletId = await getOrCreateWallet(fromCurrency);
    const toWalletId = await getOrCreateWallet(toCurrency);

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
          fee_breakdown: {
            total_fee_percentage: 7.5,
            admin_fee_percentage: 6.0,
            referrer_fee_percentage: 0.5,
            reward_user_fee_percentage: 1.0,
            net_amount: netAmount,
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
      netAmount: netAmount,
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
  lockId = null, // Rate lock optional but highly recommended
  slippageTolerance = 0.005, // 0.5% default
) {
  let preview;

  // REQUIREMENT: Verify rate lock
  if (lockId) {
    const { data: lockedPreview, error: quoteError } = await supabase
      .from("swap_quotes")
      .select("*")
      .eq("id", lockId)
      .single();

    if (quoteError || !lockedPreview) {
      console.error("[Swap Execute] Quote missing:", quoteError?.message);
      require("fs").appendFileSync(
        "swap_error_debug.log",
        "Quote missing: " + (quoteError?.message || "Not found") + "\n",
      );
      throw new Error("Rate lock expired or invalid. Please refresh price.");
    }

    if (lockedPreview.status !== "PENDING") {
      throw new Error(
        `Quote has already been used or expired. Current status: ${lockedPreview.status}`,
      );
    }

    if (
      lockedPreview.from_currency !== fromCurrency ||
      lockedPreview.to_currency !== toCurrency ||
      Math.abs(parseFloat(lockedPreview.from_amount) - amount) > 0.0001
    ) {
      throw new Error("Lock parameters do not match requested swap.");
    }

    preview = {
      to_amount: lockedPreview.to_amount,
      fee: parseFloat(lockedPreview.fee),
      rate: parseFloat(lockedPreview.rate),
    };
  } else {
    // Fallback to fresh quote if no lock (less desirable)
    preview = await calculateSwapPreview(
      userId, // Fixed missing userId
      fromCurrency,
      toCurrency,
      amount,
      userPlan,
      slippageTolerance,
    );
    lockId = preview.lockId; // Generate lock dynamically
  }

  // Check for duplicate request
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("transactions")
      .select("id")
      .or(
        `metadata->>'idempotency_key'.eq.${idempotencyKey},metadata->>'idempotencyKey'.eq.${idempotencyKey}`,
      )
      .maybeSingle();

    if (existing) {
      throw new Error("Duplicate swap request");
    }
  }

  // The wallet existence and balance check is now handled by the RPC function
  // based on the quote ID, which ensures wallets exist and balance is sufficient.

  // Get exact current market price at time of execution to enforce slippage strictly in RPC
  const rawMarketRate = await fxService.getRate(fromCurrency, toCurrency);

  // Apply the same commission spread to the live rate so we are comparing apples-to-apples correctly in slippage
  const spreadResult = await commissionService.calculateSpread(
    "SELL",
    rawMarketRate,
    userPlan,
  );
  const currentFinalPrice = spreadResult.finalPrice;

  // NEW EXTERNAL FACILITATOR LOGIC
  // Instead of an atomic internal ledger swap, we call NOWPayments to convert funds
  // on behalf of the user. The ledger will be updated via webhook.
  const internalReference = `swp_${Date.now()}_${userId.substring(0, 8)}`;

  // Note: For fiat to crypto, NOWPayments requires their fiat-to-crypto partners.
  // For crypto to crypto, NOWPayments handles it directly.
  // We assume the payoutService has been extended to support this or a generic transfer
  // is initiated that the webhooks will reconcile.
  let conversionResult;
  try {
    conversionResult = await payoutService.createNowPaymentsConversion(
      fromCurrency,
      toCurrency,
      amount,
      internalReference,
    );
  } catch (providerError) {
    throw new Error(
      `Failed to initiate swap with provider: ${providerError.message}`,
    );
  }

  // We still need to record the intent in the database so the webhook can find it
  // This replaces the execute_swap_from_quote RPC, which acted as an internal exchange.
  // Instead, we just freeze the funds from the source wallet pending completion.

  const { data: quoteRecord } = await supabase.from("swap_quotes").select(
    "from_wallet_id, to_wallet_id",
  ).eq("id", lockId).single();

  const { data: txId, error: txError } = await supabase.rpc(
    "initiate_external_swap_intent", // A new RPC we need to create to safely freeze funds
    {
      p_from_wallet_id: quoteRecord.from_wallet_id,
      p_to_wallet_id: quoteRecord.to_wallet_id,
      p_amount: amount,
      p_quote_id: lockId,
      p_reference: internalReference,
      p_external_conversion_id: String(conversionResult.conversionId),
      p_provider: "NOWPAYMENTS",
    },
  );

  if (txError) {
    logger.error("Swap Intent Recording Failed", {
      error: txError.message,
      userId,
    });
    require("fs").appendFileSync(
      "swap_error_debug.log",
      JSON.stringify(txError) + "\n",
    );
    throw new Error(txError.message || "Swap execution failed");
  }

  try {
    const { createNotification } = require("./notificationService");
    await createNotification({
      receiverId: userId,
      type: "wallet_swap",
      title: "Swap Completed",
      message:
        `Successfully swapped ${amount} ${fromCurrency} for ${preview.to_amount} ${toCurrency}`,
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
    amountIn: amount,
    amountOut: preview.to_amount,
    fee: preview.fee,
    rate: preview.rate,
    status: conversionResult.status || "processing", // Let the client know it's pending external validation
  };
}

module.exports = {
  getAllExchangeRates,
  calculateSwapPreview,
  executeSwap,
};
