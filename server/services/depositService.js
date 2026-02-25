const supabase = require("../config/supabase");
const { v4: uuidv4 } = require("uuid");
const fxService = require("./fxService");
const commissionService = require("./commissionService");
const logger = require("../utils/logger");
const paystackService = require("./paystackService");
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
  // Fetch user profile for email
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile || !profile.email) {
    throw new Error("User profile or email not found");
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

  const selectedDetails = allBankDetails[currency] || allBankDetails.USD;

  // Fetch user profile for email
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

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
      manualReview: true,
    },
  );

  return {
    reference: payment.reference,
    amount,
    currency,
    bankDetails: {
      ...selectedDetails,
      accountName: selectedDetails.accountName + " / " + payment.reference,
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
  // Fetch user profile for email
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile || !profile.email) {
    throw new Error("User profile or email not found");
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
