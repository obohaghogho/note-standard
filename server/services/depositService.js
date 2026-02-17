const supabase = require("../config/supabase");
const { v4: uuidv4 } = require("uuid");
const fxService = require("./fxService");
const commissionService = require("./commissionService");
const paystackService = require("./paystackService");
const CLIENT_URL = process.env.CLIENT_URL || "https://notestandard.com";

/**
 * Create a card deposit session using Paystack
 */
async function createCardDeposit(userId, currency, amount, userPlan = "FREE") {
  const referenceId = uuidv4(); // Internal UUID
  const providerRef = `card_${uuidv4()}`; // External reference for Paystack

  // Get or create wallet
  let { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("currency", currency)
    .single();

  if (!wallet) {
    const { data: newWallet, error: createError } = await supabase
      .from("wallets")
      .insert({
        user_id: userId,
        currency,
        balance: 0,
        address: uuidv4(),
      })
      .select()
      .single();

    if (createError) throw createError;
    wallet = newWallet;
  }

  // Calculate Fee
  const feeResult = await commissionService.calculateCommission(
    "FUNDING",
    amount,
    currency,
    userPlan,
  );
  const netAmount = amount - feeResult.fee;

  // Calculate amount in NGN (Paystack charges in NGN)
  let amountToChargeNgn;
  let exchangeRate = 1.0;

  if (currency === "NGN") {
    amountToChargeNgn = parseFloat(amount);
  } else {
    const conversion = await fxService.convert(
      parseFloat(amount),
      currency,
      "NGN",
      true,
    );
    amountToChargeNgn = conversion.amount;
    exchangeRate = conversion.rate;
  }

  const amountInSmallestUnit = Math.round(amountToChargeNgn * 100);

  // Create pending deposit transaction
  const { error: txError } = await supabase
    .from("transactions")
    .insert({
      wallet_id: wallet.id,
      type: "Digital Assets Purchase",
      // display_label removed (not in schema)
      amount: netAmount, // Net amount to be credited
      currency,
      status: "PENDING",
      reference_id: referenceId,
      fee: feeResult.fee,
      metadata: {
        method: "card",
        user_id: userId,
        rate: exchangeRate,
        charged_ngn: amountToChargeNgn,
        original_amount: amount,
        category: "digital_assets",
        product_type: "digital_asset",
        display_ref: providerRef,
        display_label: "Digital Assets Purchase",
        transaction_fee_breakdown: {
          funding_fee: feeResult.fee,
          user_plan: userPlan,
        },
      },
      exchange_rate: exchangeRate,
      charged_amount_ngn: amountToChargeNgn,
    });

  if (txError) throw txError;

  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const userEmail = authUser.user.email;
    const callbackUrl =
      `${CLIENT_URL}/dashboard/wallet?payment_callback=true&reference=${providerRef}`;

    const paystackData = await paystackService.initializeTransaction(
      userEmail,
      amountInSmallestUnit,
      callbackUrl,
      {
        user_id: userId,
        wallet_id: wallet.id,
        currency,
        amount: amount.toString(),
        type: "deposit",
        exchangeRate,
        chargedAmountNgn: amountToChargeNgn,
      },
      providerRef, // Pass our reference explicitly
    );

    return {
      reference: providerRef,
      checkoutUrl: paystackData.authorization_url,
      accessCode: paystackData.access_code,
      amount,
      currency,
      fee: feeResult.fee,
      netAmount,
    };
  } catch (paystackError) {
    await supabase.from("transactions").update({
      status: "FAILED",
      metadata: { method: "card", error: paystackError.message },
    }).eq("reference_id", referenceId);
    throw new Error(`Payment initialization failed: ${paystackError.message}`);
  }
}

/**
 * Create a bank transfer deposit
 */
async function createBankDeposit(userId, currency, amount, userPlan = "FREE") {
  const referenceId = uuidv4();
  const providerRef = `bank_${uuidv4().substring(0, 8).toUpperCase()}`;

  // Get or create wallet
  let { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("currency", currency)
    .single();

  if (!wallet) {
    const { data: newWallet, error: createError } = await supabase
      .from("wallets")
      .insert({
        user_id: userId,
        currency,
        balance: 0,
        address: uuidv4(),
      })
      .select()
      .single();

    if (createError) throw createError;
    wallet = newWallet;
  }

  // Calculate Fee
  const feeResult = await commissionService.calculateCommission(
    "FUNDING",
    amount,
    currency,
    userPlan,
  );
  const netAmount = amount - feeResult.fee;

  // Create pending deposit transaction
  const { error: txError } = await supabase
    .from("transactions")
    .insert({
      wallet_id: wallet.id,
      type: "Digital Assets Purchase",
      // display_label removed
      amount: netAmount,
      currency,
      status: "PENDING",
      reference_id: referenceId,
      fee: feeResult.fee,
      metadata: {
        method: "bank",
        user_id: userId,
        original_amount: amount,
        category: "digital_assets",
        product_type: "digital_asset",
        display_ref: providerRef,
        display_label: "Digital Assets Purchase",
        transaction_fee_breakdown: {
          funding_fee: feeResult.fee,
          user_plan: userPlan,
        },
      },
    });

  if (txError) throw txError;

  const bankDetails = {
    NGN: {
      bankName: "Paystack-Titan MFB",
      accountNumber: "9901234567",
      accountName: "NoteStandard / " + providerRef,
      reference: providerRef,
      note:
        "Transfer exactly the amount shown. Include the reference in your transfer description.",
    },
    USD: {
      bankName: "Chase Bank",
      routingNumber: "021000021",
      accountNumber: "9876543210",
      accountName: "NoteStandard Inc",
      reference: providerRef,
      swiftCode: "CHASUS33",
      note: "Include the reference in your wire transfer memo.",
    },
  };

  return {
    reference: providerRef,
    amount,
    currency,
    fee: feeResult.fee,
    netAmount,
    bankDetails: bankDetails[currency] || bankDetails.USD,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function getCryptoDepositAddress(userId, currency) {
  let { data: wallet } = await supabase
    .from("wallets")
    .select("id, address")
    .eq("user_id", userId)
    .eq("currency", currency)
    .single();

  if (!wallet) {
    const address = generateCryptoAddress(currency);
    const { data: newWallet, error } = await supabase
      .from("wallets")
      .insert({
        user_id: userId,
        currency,
        balance: 0,
        address,
      })
      .select()
      .single();

    if (error) throw error;
    wallet = newWallet;
  }

  return {
    currency,
    address: wallet.address,
    network: getNetworkName(currency),
    minDeposit: getMinDeposit(currency),
  };
}

async function confirmDeposit(reference, externalHash = null) {
  console.log(`[DepositService] Confirming deposit ${reference}`);

  const { data: tx, error: findError } = await supabase
    .from("transactions")
    .select("*, wallet:wallets(id, user_id, balance, currency)")
    .eq("metadata->>display_ref", reference) // Use metadata lookup
    .single();

  if (findError || !tx) {
    throw new Error("Deposit transaction not found");
  }

  if (tx.status === "COMPLETED") {
    return {
      success: true,
      amount: tx.amount,
      currency: tx.currency,
      alreadyProcessed: true,
    };
  }

  if (tx.status === "FAILED") {
    throw new Error("Cannot confirm a failed transaction");
  }

  // Credit wallet
  const { error: rpcError } = await supabase.rpc("confirm_deposit", {
    p_transaction_id: tx.id,
    p_wallet_id: tx.wallet_id,
    p_amount: tx.amount, // This is the net amount
    p_external_hash: externalHash,
  });

  if (rpcError) {
    // Fallback manual credit
    const newBalance = parseFloat(tx.wallet.balance) + parseFloat(tx.amount);
    await supabase.from("wallets").update({ balance: newBalance }).eq(
      "id",
      tx.wallet_id,
    );
    await supabase.from("transactions").update({
      status: "COMPLETED",
      external_hash: externalHash,
    }).eq("id", tx.id);
  }

  // Log Revenue (Funding Fee)
  if (tx.fee > 0) {
    await commissionService.logRevenue(
      tx.wallet.user_id,
      tx.fee,
      tx.currency,
      "funding_fee",
      tx.id,
    );
  }

  try {
    const { createNotification } = require("./notificationService");
    await createNotification({
      receiverId: tx.wallet.user_id,
      type: "wallet_deposit",
      title: "Deposit Confirmed",
      message:
        `Your deposit of ${tx.amount} ${tx.currency} (after fees) has been confirmed.`,
      link: "/dashboard/wallet",
    });
  } catch (nErr) {}

  return {
    success: true,
    amount: tx.amount,
    currency: tx.currency,
    walletId: tx.wallet_id,
  };
}

async function failDeposit(reference, reason = "Payment failed") {
  await supabase.from("transactions").update({
    status: "FAILED",
    metadata: { failReason: reason },
    updated_at: new Date().toISOString(),
  }).eq("metadata->>display_ref", reference).eq("status", "PENDING");
  return { success: true };
}

async function getDepositStatus(reference) {
  const { data: tx, error } = await supabase.from("transactions").select(
    "id, status, amount, currency, created_at, updated_at",
  ).eq("metadata->>display_ref", reference).single();
  return error || !tx ? null : tx;
}

function generateCryptoAddress(currency) {
  const prefix = currency === "BTC" ? "bc1" : "0x";
  return `${prefix}${uuidv4().replace(/-/g, "").substring(0, 32)}`;
}

function getNetworkName(currency) {
  const networks = {
    "BTC": "Bitcoin Mainnet",
    "ETH": "Ethereum Mainnet (ERC-20)",
  };
  return networks[currency] || "Unknown";
}

function getMinDeposit(currency) {
  const mins = { "BTC": 0.0001, "ETH": 0.001 };
  return mins[currency] || 0;
}

async function getExchangeRate(from, to) {
  return await fxService.getRate(from, to);
}

module.exports = {
  createCardDeposit,
  createBankDeposit,
  getCryptoDepositAddress,
  confirmDeposit,
  failDeposit,
  getDepositStatus,
  getExchangeRate,
};
