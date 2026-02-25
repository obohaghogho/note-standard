const supabase = require("../config/supabase");
const { v4: uuidv4 } = require("uuid");
const fxService = require("./fxService");
const commissionService = require("./commissionService");
const logger = require("../utils/logger");

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
  fromCurrency,
  toCurrency,
  amount,
  userPlan = "FREE",
) {
  try {
    console.log(
      `[SwapService] Preview request: ${amount} ${fromCurrency} -> ${toCurrency} (${userPlan})`,
    );

    // REQUIREMENT: Integrated real pricing (CoinGecko via fxService)
    const marketPrice = await fxService.getRate(fromCurrency, toCurrency);
    if (!marketPrice) {
      throw new Error(`Could not fetch rate for ${fromCurrency}/${toCurrency}`);
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

    const amountOut = amountToSwap * finalPrice;

    console.log(
      `[SwapService] Preview calculated: ${amountToSwap} * ${finalPrice} = ${amountOut}`,
    );

    // REQUIREMENT: Lock rate for 30 seconds
    const lockId = `lock_${uuidv4()}`;
    const preview = {
      lockId,
      fromCurrency,
      toCurrency,
      amountIn: amount,
      marketPrice: spreadResult.marketPrice,
      rate: spreadResult.finalPrice, // Compatibility with client
      finalPrice: spreadResult.finalPrice,
      spreadAmount: spreadResult.spreadAmount,
      spreadPercentage: spreadResult.spreadPercentage,
      fee: feeResult.fee,
      feePercentage: feeResult.rate * 100,
      amountOut: parseFloat(amountOut.toFixed(8)),
      netAmount: amountToSwap, // Compatibility with client
      netAmountSent: amountToSwap,
      feeBreakdown: {
        processing_fee: feeResult.fee,
        spread_fee_equivalent: spreadAmountInQuote,
        total_fee_label: "Transaction Fees",
      },
      expiresAt: Date.now() + LOCK_EXPIRY_MS,
    };

    rateLocks.set(lockId, preview);

    // Cleanup lock after expiry
    setTimeout(() => rateLocks.delete(lockId), LOCK_EXPIRY_MS + 2000);

    return preview;
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
      fromCurrency,
      toCurrency,
      amount,
      userPlan,
    );
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

  // Get source wallet
  const { data: fromWallet, error: fromErr } = await supabase
    .from("wallets")
    .select("id, available_balance")
    .eq("user_id", userId)
    .eq("currency", fromCurrency)
    .single();

  if (fromErr || !fromWallet) {
    throw new Error(`${fromCurrency} wallet not found`);
  }

  // Check balance (Use available_balance for ledger safety)
  const parseAmount = parseFloat(amount);
  if (parseFloat(fromWallet.available_balance) < parseAmount) {
    throw new Error(
      `Insufficient ${fromCurrency} balance (Available: ${fromWallet.available_balance})`,
    );
  }

  // Get or create destination wallet
  let { data: toWallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("currency", toCurrency)
    .single();

  if (!toWallet) {
    const { data: newWallet, error: createErr } = await supabase
      .from("wallets")
      .insert({
        user_id: userId,
        currency: toCurrency,
        address: uuidv4(),
      })
      .select()
      .single();

    if (createErr) throw createErr;
    toWallet = newWallet;
  }

  const platformWalletId = await commissionService.getPlatformWalletId(
    fromCurrency,
  );

  // REQUIREMENT: Store rate in transaction record (via Atomic RPC)
  const { data: txId, error: txError } = await supabase.rpc(
    "execute_swap_atomic",
    {
      p_user_id: userId,
      p_from_wallet_id: fromWallet.id,
      p_to_wallet_id: toWallet.id,
      p_from_amount: preview.netAmountSent,
      p_to_amount: preview.amountOut,
      p_from_currency: fromCurrency,
      p_to_currency: toCurrency,
      p_rate: preview.finalPrice,
      p_spread_amount: preview.spreadPercentage,
      p_fee: preview.fee,
      p_platform_wallet_id: platformWalletId,
      p_idempotency_key: idempotencyKey,
      p_metadata: {
        lockId,
        market_price: preview.marketPrice,
        final_price: preview.finalPrice,
        fee_breakdown: preview.feeBreakdown,
        user_plan: userPlan,
      },
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
        `Successfully swapped ${parseAmount} ${fromCurrency} for ${preview.amountOut} ${toCurrency}`,
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
    amountIn: parseAmount,
    amountOut: preview.amountOut,
    fee: preview.fee,
    rate: preview.finalPrice,
  };
}

module.exports = {
  getAllExchangeRates,
  calculateSwapPreview,
  executeSwap,
};
