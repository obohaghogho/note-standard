const supabase = require("../config/supabase");
const { v4: uuidv4 } = require("uuid");
const fxService = require("./fxService");
const commissionService = require("./commissionService");
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

    const feeResult = await commissionService.calculateCommission(
      "SWAP",
      amount,
      fromCurrency,
      userPlan,
    );

    const amountToSwap = amount - feeResult.fee;
    if (amountToSwap <= 0) {
      throw new Error(
        `Amount too small to cover fee (${feeResult.fee} ${fromCurrency})`,
      );
    }

    // Determine output based on quote rate
    // Note: fxService.getRate returns price of `fromCurrency` in terms of `toCurrency`
    // Example: getRate('USD', 'ETH') => 1 USD = 0.0003 ETH
    // Example: getRate('ETH', 'USD') => 1 ETH = 3000 USD
    // Therefore we ALWAY multiply amountToSwap * rate from fxService natively

    // We use mathUtils to protect precision against float math bugs
    const preciseAmountOut = mathUtils.multiply(amountToSwap, finalPrice);

    // Format output with correct decimal precision
    const formattedAmountOut = mathUtils.formatForCurrency(
      parseFloat(preciseAmountOut),
      toCurrency,
    );

    console.log(
      `[SwapService] Preview calculated: ${amountToSwap} * ${finalPrice} = ${formattedAmountOut}`,
    );

    // REQUIREMENT: Max Swap Limit Check
    const { data: maxSwapSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "max_swap_amount")
      .single();

    const maxSwap = parseFloat(maxSwapSetting?.value || "5000");
    if (amount > maxSwap) {
      throw new Error(
        `Maximum swap amount exceeded (Limit: ${maxSwap} equivalent)`,
      );
    }

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
        fee: feeResult.fee,
        slippage_tolerance: slippageTolerance,
        expires_at: new Date(Date.now() + LOCK_EXPIRY_MS).toISOString(),
        metadata: {
          market_price: spreadResult.marketPrice,
          spread_percentage: spreadResult.spreadPercentage,
          user_plan: userPlan,
          fee_breakdown: {
            processing_fee: feeResult.fee,
            spread_fee_equivalent: spreadAmountInQuote,
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
      netAmount: amountToSwap,
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
    const lockedPreview = rateLocks.get(lockId);
    if (!lockedPreview) {
      throw new Error("Rate lock expired or invalid. Please refresh price.");
    }
    if (
      lockedPreview.fromCurrency !== fromCurrency ||
      lockedPreview.toCurrency !== toCurrency ||
      Math.abs(lockedPreview.amountIn - amount) > 0.0001
    ) {
      throw new Error("Lock parameters mismatch");
    }
    preview = lockedPreview;
    rateLocks.delete(lockId); // Consume lock
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
  const currentMarketRate = await fxService.getRate(fromCurrency, toCurrency);

  const { data: txId, error: txError } = await supabase.rpc(
    "execute_swap_from_quote",
    {
      p_quote_id: lockId,
      p_current_market_rate: currentMarketRate,
      p_idempotency_key: idempotencyKey,
    },
  );

  if (txError) {
    logger.error("Swap RPC Failed", { error: txError.message, userId });
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
  };
}

module.exports = {
  getAllExchangeRates,
  calculateSwapPreview,
  executeSwap,
};
