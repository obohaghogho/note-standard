const supabase = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const fxService = require("./fxService");
const commissionService = require("./commissionService");
const logger = require("../utils/logger");
const paystackService = require("./paystackService");
const math = require("../utils/mathUtils");
const { checkDailyLimit } = require("../utils/limitCheck");
const CLIENT_URL = process.env.CLIENT_URL || "https://notestandard.com";

const PaymentService = require("./payment/paymentService");

/**
 * Create a card deposit session using production PaymentService
 */
async function createCardDeposit(
  userId,
  currency,
  amount,
  userPlan = "FREE",
  idempotencyKey = null,
) {
  const upCurrency = currency.toUpperCase();
  if (upCurrency === "BTC" || upCurrency === "ETH") {
    throw new Error("BTC and ETH deposits are not supported via payment");
  }

  // Fetch user profile for email
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile || !profile.email) {
    throw new Error("User profile or email not found");
  }

  // 1. Check Internal Daily Limits
  const limit = await checkDailyLimit(userId, userPlan, amount);
  if (!limit.allowed) {
    throw new Error(
      `Daily limit exceeded. You have ${limit.remaining} ${currency} remaining for today.`,
    );
  }

  // 2. Check Provider/Test Mode Limits (Flutterwave test mode cap)
  // We use a safe margin of $5,000 USD equivalent.
  const MAX_USD_EQUIVALENT = 5000;
  try {
    const rate = await fxService.getRate(currency, "USD");
    const amountInUsd = math.multiply(amount, rate);
    
    if (parseFloat(amountInUsd) > MAX_USD_EQUIVALENT) {
      const maxInCurrency = math.divide(MAX_USD_EQUIVALENT, rate, math.getDecimals(currency));
      throw new Error(
        `Transaction amount too high. Maximum per transaction is approximately ${maxInCurrency} ${currency} ($${MAX_USD_EQUIVALENT} USD).`,
      );
    }
  } catch (fxErr) {
    // If FX fails, fallback to a VERY safe hardcoded cap for known currencies or just allow (failing safe)
    if (currency === "JPY" && amount > 1000000) {
      throw new Error("JPY amount too high for test mode");
    }
    if (currency === "EUR" && amount > 4000) {
      throw new Error("EUR amount too high for test mode");
    }
  }

  // Initialize payment through unified service
  // This handles provider selection (Paystack/Flutterwave/Stripe) and DB records
  return await PaymentService.initializePayment(
    userId,
    profile.email,
    amount,
    currency,
    {
      type: "DEPOSIT",
      userPlan,
      idempotencyKey,
    },
    {
      isCrypto: false,
    },
  );
}

/**
 * Create a bank transfer deposit using production logic
 */
async function createBankDeposit(
  userId,
  currency,
  amount,
  userPlan = "FREE",
  idempotencyKey = null,
) {
  const upCurrency = currency.toUpperCase();
  if (upCurrency === "BTC" || upCurrency === "ETH") {
    throw new Error("BTC and ETH deposits are not supported via bank transfer");
  }

  // Fetch bank details from settings instead of hardcoding
  const allBankDetails =
    await commissionService.getSetting("bank_deposit_details") || {
      NGN: {
        bankName: "Paystack-Titan MFB",
        accountNumber: "9901234567",
        accountName: "NoteStandard Admin",
        note: "Include reference in transfer description",
      },
      USD: {
        bankName: "Chase Bank",
        accountNumber: "9876543210",
        routingNumber: "021000021",
        accountName: "NoteStandard Inc",
        note: "Include reference in memo",
      },
    };

  // Fetch user profile for email/names
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, first_name, last_name, phone")
    .eq("id", userId)
    .single();

  let selectedDetails = allBankDetails[upCurrency] || allBankDetails.USD;

  // 1a. Attempt Real-time Virtual Account Generation
  try {
    if (upCurrency === "NGN") {
      const PaystackProvider = require("./payment/providers/PaystackProvider");
      const paystack = new PaystackProvider();
      const virtualAccount = await paystack.getDedicatedAccount(
        profile.email,
        profile.first_name || profile.full_name?.split(" ")[0] || "User",
        profile.last_name || profile.full_name?.split(" ").slice(1).join(" ") || "Standard",
        profile.phone || ""
      );
      
      selectedDetails = {
        bankName: virtualAccount.bankName,
        accountNumber: virtualAccount.accountNumber,
        accountName: virtualAccount.accountName,
        note: "Funds are credited instantly after transfer",
      };
    } else if (["USD", "EUR", "GBP"].includes(upCurrency)) {
      // Try Fincra or Flutterwave for Global Accounts
      const FincraProvider = require("./payment/providers/FincraProvider");
      const fincra = new FincraProvider();
      const virtualAccount = await fincra.createVirtualAccount({
        currency: upCurrency,
        email: profile.email,
        firstName: profile.first_name || profile.full_name?.split(" ")[0] || "User",
        lastName: profile.last_name || profile.full_name?.split(" ").slice(1).join(" ") || "Standard",
        phone: profile.phone || "",
      });

      selectedDetails = {
        bankName: virtualAccount.bankName,
        accountNumber: virtualAccount.accountNumber,
        accountName: virtualAccount.accountName,
        routingNumber: virtualAccount.routingNumber || virtualAccount.swiftCode,
        note: `Funds are credited after ${upCurrency} settlement (1-3 days)`,
      };
    }
  } catch (err) {
    logger.warn(`Failed to auto-generate ${upCurrency} virtual account, falling back to static details: ${err.message}`);
  }

  // Check Daily Limits
  const limit = await checkDailyLimit(userId, userPlan, amount);
  if (!limit.allowed) {
    throw new Error(
      `Daily limit exceeded. You have ${limit.remaining} ${currency} remaining for today.`,
    );
  }

  // Unified Payment Record
  const payment = await PaymentService.initializePayment(
    userId,
    profile?.email || "",
    amount,
    currency,
    {
      type: "DEPOSIT",
      method: "bank_transfer",
      userPlan,
      idempotencyKey,
    },
    {
      isCrypto: false,
      manualReview: upCurrency !== "NGN", // Real-time for NGN via webhooks
    },
  );

  return {
    reference: payment.reference,
    amount: math.formatForCurrency(amount, currency),
    currency,
    bankDetails: {
      ...selectedDetails,
      accountName: selectedDetails.accountName + (upCurrency !== "NGN" ? " / " + payment.reference : ""),
      reference: payment.reference,
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Initialize a crypto deposit using real provider (e.g. NOWPayments)
 */
async function initializeCryptoDeposit(
  userId,
  currency,
  amount = 10,
  userPlan = "FREE",
  idempotencyKey = null,
) {
  const upCurrency = currency.toUpperCase();
  if (upCurrency === "BTC" || upCurrency === "ETH") {
    throw new Error("BTC and ETH deposits are not supported");
  }

  console.log(
    `[DepositService] Initializing crypto deposit for user ${userId}, amount ${amount}`,
  );
  // Fetch user profile for email
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile || !profile.email) {
    throw new Error("User profile or email not found");
  }

  // Check Daily Limits
  const limit = await checkDailyLimit(userId, userPlan, amount);
  if (!limit.allowed) {
    throw new Error(
      `Daily limit exceeded. You have ${limit.remaining} ${currency} remaining for today.`,
    );
  }

  // Initialize payment through unified service
  return await PaymentService.initializePayment(
    userId,
    profile.email,
    amount,
    currency,
    {
      type: "Digital Assets Purchase",
      userPlan,
      idempotencyKey,
    },
    {
      isCrypto: true,
    },
  );
}

// Deprecated in favor of initializeCryptoDeposit (which requires an amount for real gateways)
async function getCryptoDepositAddress(userId, currency) {
  console.warn(
    "[DepositService] getCryptoDepositAddress is deprecated. Use initializeCryptoDeposit.",
  );
  return await initializeCryptoDeposit(userId, currency, 10); // Default placeholder amount
}

async function confirmDeposit(reference, externalHash = null) {
  console.log(`[DepositService] Confirming deposit ${reference}`);

  const { data: tx, error: findError } = await supabase
    .from("transactions")
    .select("*, wallet:wallets(id, user_id, balance, currency)")
    .or(`reference_id.eq.${reference},metadata->>display_ref.eq.${reference}`)
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

  // Credit wallet via ledger-pure RPC
  // The Migration 067 trigger will automatically recalculate the wallet balance when status -> COMPLETED.
  const { error: rpcError } = await supabase.rpc("confirm_deposit", {
    p_transaction_id: tx.id,
    p_wallet_id: tx.wallet_id,
    p_amount: tx.amount, // This is the net amount
    p_external_hash: externalHash,
  });

  if (rpcError) {
    logger.error("confirm_deposit RPC failed", {
      error: rpcError.message,
      txId: tx.id,
    });
    throw new Error(`Failed to confirm deposit: ${rpcError.message}`);
  }

  // NOTE: Revenue logging is now handled by the 'trg_auto_revenue' DB trigger on the transactions table.
  // We no longer call commissionService.logRevenue here to avoid double-logging.

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
  ).or(`reference_id.eq.${reference},metadata->>display_ref.eq.${reference}`)
    .single();
  return error || !tx ? null : tx;
}

// Helpers removed: generateCryptoAddress, getNetworkName, getMinDeposit
// Logic is now delegated to real providers via PaymentService.

async function getExchangeRate(from, to) {
  return await fxService.getRate(from, to);
}

module.exports = {
  createCardDeposit,
  createBankDeposit,
  initializeCryptoDeposit,
  getCryptoDepositAddress,
  confirmDeposit,
  failDeposit,
  getDepositStatus,
  getExchangeRate,
};
