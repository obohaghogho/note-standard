const supabase = require("../config/supabase");
const { v4: uuidv4 } = require("uuid");
const fxService = require("./fxService");
const commissionService = require("./commissionService");

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
 * Calculate swap preview (amount out, fees/spread)
 */
async function calculateSwapPreview(
  fromCurrency,
  toCurrency,
  amount,
  userPlan = "FREE",
) {
  const marketPrice = await fxService.getRate(fromCurrency, toCurrency);

  // Requirement 1: Transaction Spread System
  // For a swap, we apply spread on the market price
  // BUY: final_price = market_price + (market_price * spread_percentage)
  // SELL: final_price = market_price - (market_price * spread_percentage)
  // In a swap from A to B, it's like selling A for B.
  // The rate we use is the "SELL" rate of A in terms of B.
  const spreadResult = await commissionService.calculateSpread(
    "SELL",
    marketPrice,
    userPlan,
  );

  const finalPrice = spreadResult.finalPrice;
  const spreadAmountInQuote = spreadResult.spreadAmount * amount; // This is in toCurrency

  // We also have a swap fee (processing fee)
  const feeResult = await commissionService.calculateCommission(
    "SWAP",
    amount,
    fromCurrency,
    userPlan,
  );

  const amountToSwap = amount - feeResult.fee;
  const amountOut = amountToSwap * finalPrice;

  return {
    fromCurrency,
    toCurrency,
    amountIn: amount,
    marketPrice: spreadResult.marketPrice,
    finalPrice: spreadResult.finalPrice,
    spreadAmount: spreadResult.spreadAmount,
    spreadPercentage: spreadResult.spreadPercentage,
    fee: feeResult.fee,
    feePercentage: feeResult.rate * 100,
    amountOut: parseFloat(amountOut.toFixed(8)),
    netAmountSent: amountToSwap,
    feeBreakdown: {
      processing_fee: feeResult.fee,
      spread_fee_equivalent: spreadAmountInQuote,
      total_fee_label: "Transaction Fees",
    },
  };
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
) {
  // Check for duplicate request
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("transactions")
      .select("id")
      .eq("metadata->>idempotencyKey", idempotencyKey)
      .single();

    if (existing) {
      throw new Error("Duplicate swap request");
    }
  }

  // Get source wallet
  const { data: fromWallet, error: fromErr } = await supabase
    .from("wallets")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency", fromCurrency)
    .single();

  if (fromErr || !fromWallet) {
    throw new Error(`${fromCurrency} wallet not found`);
  }

  // Check balance
  const parseAmount = parseFloat(amount);
  if (parseFloat(fromWallet.balance) < parseAmount) {
    throw new Error(`Insufficient ${fromCurrency} balance`);
  }

  // Get or create destination wallet
  let { data: toWallet } = await supabase
    .from("wallets")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency", toCurrency)
    .single();

  if (!toWallet) {
    const { data: newWallet, error: createErr } = await supabase
      .from("wallets")
      .insert({
        user_id: userId,
        currency: toCurrency,
        balance: 0,
        address: uuidv4(),
      })
      .select()
      .single();

    if (createErr) throw createErr;
    toWallet = newWallet;
  }

  // Calculate swap with monetization
  const preview = await calculateSwapPreview(
    fromCurrency,
    toCurrency,
    parseAmount,
    userPlan,
  );

  // Use a UUID for the database reference_id column
  const referenceId = uuidv4();
  // Create a human-readable ref for display/metadata
  const displayRef = `swap_${referenceId.substring(0, 8)}`;

  // Update logic to store spread and logging
  // Note: Storing detailed pricing info in metadata since columns might not exist
  const { error: txError } = await supabase.from("transactions").insert([
    {
      wallet_id: fromWallet.id,
      type: "Digital Assets Purchase",
      // display_label removed (not in schema), moved to metadata if needed
      amount: parseAmount,
      currency: fromCurrency,
      status: "COMPLETED",
      reference_id: referenceId,
      fee: preview.fee,
      // moved market_price, final_price, spread_amount, transaction_fee_breakdown to metadata
      metadata: {
        direction: "OUT",
        swapTo: toCurrency,
        rate: preview.finalPrice,
        amountReceived: preview.amountOut,
        idempotencyKey,
        category: "digital_assets",
        product_type: "digital_asset",
        display_label: "Digital Assets Purchase",
        market_price: preview.marketPrice,
        final_price: preview.finalPrice,
        spread_amount: preview.spreadAmount,
        transaction_fee_breakdown: preview.feeBreakdown,
        display_ref: displayRef,
      },
    },
    {
      wallet_id: toWallet.id,
      type: "Digital Assets Purchase",
      amount: preview.amountOut,
      currency: toCurrency,
      status: "COMPLETED",
      reference_id: referenceId,
      fee: 0,
      metadata: {
        direction: "IN",
        swapFrom: fromCurrency,
        rate: preview.finalPrice,
        amountSent: parseAmount,
        idempotencyKey,
        category: "digital_assets",
        product_type: "digital_asset",
        display_label: "Digital Assets Purchase",
        display_ref: displayRef,
      },
    },
  ]);

  if (txError) throw txError;

  // Debit/Credit balances
  await supabase.from("wallets").update({
    balance: parseFloat(fromWallet.balance) - parseAmount,
  }).eq("id", fromWallet.id);
  await supabase.from("wallets").update({
    balance: parseFloat(toWallet.balance) + preview.amountOut,
  }).eq("id", toWallet.id);

  // Log Revenues
  // 1. Processing Fee
  if (preview.fee > 0) {
    await commissionService.logRevenue(
      userId,
      preview.fee,
      fromCurrency,
      "processing_fee",
      null, // sourceTxId
      { swap_ref: displayRef, reference_id: referenceId },
    );
  }
  // 2. Spread Revenue (Spread is in terms of the rate difference)
  // The actual revenue is (marketPrice - finalPrice) * amountSwapped in toCurrency
  const spreadRevenue = (preview.marketPrice - preview.finalPrice) *
    preview.netAmountSent;
  if (spreadRevenue > 0) {
    await commissionService.logRevenue(
      userId,
      spreadRevenue,
      toCurrency,
      "spread",
      null, // sourceTxId
      {
        swap_ref: displayRef,
        reference_id: referenceId,
        market_price: preview.marketPrice,
        final_price: preview.finalPrice,
      },
    );
  }

  // Notify user
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
  } catch (nErr) {}

  return {
    success: true,
    reference: displayRef, // Return the human-readable reference
    transactionId: referenceId, // Also return the UUID
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
