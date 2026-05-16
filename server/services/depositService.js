const supabase = require("../config/database");
console.log("[DepositService] LOADED V3 - Checking for userId in profile lookup");
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
  options = {},
) {
  const { toCurrency, toNetwork } = options;
  const upCurrency = currency.toUpperCase();
  // --- UNIVERSAL USD FALLBACK FOR INTERNATIONAL (DFOS v6.3) ---
  // Since Paystack primarily supports NGN and USD, we convert EUR/GBP/JPY
  // to USD for the gateway. This provides a better experience than NGN
  // while ensuring the transaction can be processed.
  let gatewayOptions = { isCrypto: false };

  if (["EUR", "GBP", "JPY"].includes(upCurrency)) {
    try {
      const rate = await fxService.getRate(upCurrency, "USD");
      // Add a small 1% buffer for FX volatility
      const bufferedRate = math.multiply(rate, 1.01); 
      const amountInUsd = math.multiply(amount, bufferedRate);
      
      gatewayOptions.gatewayCurrency = "USD";
      gatewayOptions.gatewayAmount = parseFloat(math.formatSafe(amountInUsd));
      
      logger.info(`[DepositService] Routing ${amount} ${upCurrency} via USD ($${gatewayOptions.gatewayAmount}) for Paystack compatibility.`);
    } catch (fxErr) {
      logger.warn(`[DepositService] USD fallback conversion failed: ${fxErr.message}. Proceeding natively.`);
    }
  } else if (upCurrency === "BTC" || upCurrency === "ETH") {
    throw new Error(`${upCurrency} deposits are not supported via payment`);
  }

  // Fetch user profile for email (Robust lookup with production fallbacks)
  let profile = null;
  let profileError = null;

  try {
    const { data: profileData, error } = await supabase
      .from("profiles")
      .select("email, full_name, username")
      .eq("id", userId)
      .single();
    profile = profileData;
    profileError = error;

    // Fallback: If full_name column doesn't exist in prod, retry with just email
    if (profileError && profileError.code === "42703") {
      logger.info("[DepositService] full_name/username missing on prod, falling back to email-only lookup");
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single();
      profile = fallbackData;
      profileError = fallbackError;
    }
  } catch (err) {
    profileError = err;
  }

  if (profileError || !profile || !profile.email) {
    logger.error("[DepositService] Card Deposit profile lookup failed", {
      userId,
      error: profileError,
      hasProfile: !!profile,
    });
    throw new Error(`Profile not found or email missing for user ${userId}. Please update your profile before depositing.`);
  }

  // 1. Check Internal Daily Limits
  const limit = await checkDailyLimit(userId, userPlan, amount);
  if (!limit.allowed) {
    throw new Error(
      `Daily limit exceeded. You have ${limit.remaining} ${currency} remaining for today.`,
    );
  }

  // 2. Check Provider/Test Mode Limits (safety cap)
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
    if (currency === "JPY" && amount > 1000000) {
      throw new Error("JPY amount too high for test mode");
    }
    if (currency === "EUR" && amount > 4000) {
      throw new Error("EUR amount too high for test mode");
    }
  }

  // Initialize payment through unified service
  return await PaymentService.initializePayment(
    userId,
    profile.email,
    amount,
    currency,
    {
      type: toCurrency && toCurrency !== currency ? "Digital Assets Purchase" : "DEPOSIT",
      method: "card",
      userPlan,
      idempotencyKey,
      targetCurrency: toCurrency,
      targetNetwork: toNetwork,
      customerName: profile.full_name || profile.username || profile.email.split("@")[0],
    },
    gatewayOptions,
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
  options = {},
) {
  const { toCurrency, toNetwork } = options;
  const upCurrency = currency.toUpperCase();
  if (upCurrency === "BTC" || upCurrency === "ETH") {
    throw new Error("BTC and ETH deposits are not supported via bank transfer");
  }

  // Define default bank details (fallbacks)
  const defaultBankDetails = {
      NGN: { bankName: "Paystack (Titan Trust)", accountNumber: "GENERATING...", accountName: "NoteStandard Wallet", note: "Please wait a moment for your secure account to be generated." },
      USD: { bankName: "Lead Bank (USD) - Grey", accountNumber: "210930905386", accountName: "tejiri jude oboh", swiftCode: "101019644", note: "Include reference in narration" },
      GBP: { bankName: "Clear Junction (GBP) - Grey", accountNumber: "42075582", accountName: "tejiri jude oboh", swiftCode: "CLJUGB21XXX", note: "Include reference in narration" },
      EUR: { bankName: "Clear Junction (EUR) - Grey", accountNumber: "GB87CLJU04130742075582", accountName: "tejiri jude oboh", swiftCode: "CLJUGB21XXX", note: "Include reference in narration" }
  };

  // Fetch bank details from settings and merge with hardcoded defaults
  const settingsBankDetails = await commissionService.getSetting("bank_deposit_details") || {};
  let allBankDetails = { ...defaultBankDetails, ...settingsBankDetails };
  
  try {
      const { data: greyData } = await supabase.from("grey_instructions").select("*");
      if (greyData && greyData.length > 0) {
          greyData.forEach(curr => {
              // Ensure we don't let Grey instructions override NGN if they happen to be there by mistake
              if (curr.currency === "NGN" && curr.bank_name.toLowerCase().includes("grey")) return;

              allBankDetails[curr.currency] = {
                  bankName: curr.bank_name,
                  accountNumber: curr.account_number,
                  accountName: curr.account_name,
                  swiftCode: curr.swift_code,
                  iban: curr.iban,
                  instructions: curr.instructions
              };
          });
      }
  } catch (err) {
      logger.warn("[DepositService] Failed to fetch from grey_instructions table:", err.message);
  }

  let profile = null;
  let profileError = null;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("email, full_name, preferences, phone, phone_number")
      .eq("id", userId)
      .single();
    profile = data;
    profileError = error;

    if (profileError && profileError.code === "42703") {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single();
      profile = fallbackData;
      profileError = fallbackError;
    }
  } catch (err) {
    profileError = err;
  }

  if (profileError || !profile || !profile.email) {
    throw new Error(`Profile not found or email missing for user ${userId}.`);
  }

  const nameParts = (profile.full_name || "User Standard").split(" ");
  const firstName = nameParts[0] || "User";
  const lastName = nameParts.slice(1).join(" ") || "Standard";
  const userPhone = profile.phone || profile.phone_number || ""; 

  let rawDetails = allBankDetails[upCurrency] || (upCurrency === "NGN" ? allBankDetails.NGN : (allBankDetails.USD || allBankDetails.NGN));
  const selectedDetails = {
    ...rawDetails,
    accountName: rawDetails.accountName || "NoteStandard Admin",
    bankName: rawDetails.bankName || "Manual Transfer",
    accountNumber: rawDetails.accountNumber || "Contact Support",
  };

  let liveDetails = { ...selectedDetails };
  
  // ── Optimization: Cache Virtual Accounts in Dedicated Accounts Table ──
  try {
      const { data: dbAccount } = await supabase
          .from("dedicated_accounts")
          .select("*")
          .eq("user_id", userId)
          .eq("currency", upCurrency)
          .eq("provider", upCurrency === "NGN" ? "paystack" : "fincra")
          .maybeSingle();

      if (dbAccount) {
          logger.info(`[DepositService] Using stored dedicated account for ${upCurrency} (User: ${userId})`);
          liveDetails = {
              bankName: dbAccount.bank_name,
              accountNumber: dbAccount.account_number,
              accountName: dbAccount.account_name,
              note: upCurrency === "NGN" 
                ? "Funds are credited instantly after transfer" 
                : `Funds are credited after ${upCurrency} settlement (1-3 days)`,
          };
      } else {
          // Generate new account if missing
          if (upCurrency === "NGN") {
              const PaystackProvider = require("./payment/providers/PaystackProvider");
              const paystack = new PaystackProvider();
              try {
                  const virtualAccount = await paystack.getDedicatedAccount(profile.email, firstName, lastName, userPhone);
                  
                  liveDetails = {
                    bankName: virtualAccount.bankName,
                    accountNumber: virtualAccount.accountNumber,
                    accountName: virtualAccount.accountName,
                    note: "Funds are credited instantly after transfer",
                  };
    
                  // Store in dedicated_accounts table
                  await supabase.from("dedicated_accounts").insert({
                      user_id: userId,
                      provider: "paystack",
                      provider_customer_code: virtualAccount.customerCode,
                      provider_account_id: String(virtualAccount.id),
                      bank_name: virtualAccount.bankName,
                      account_number: virtualAccount.accountNumber,
                      account_name: virtualAccount.accountName,
                      currency: "NGN",
                      metadata: { assignmentReference: virtualAccount.assignmentReference }
                  });
    
                  // Also sync to profiles for global resolution
                  await supabase.from("profiles").update({ 
                      paystack_customer_code: virtualAccount.customerCode 
                  }).eq("id", userId);
              } catch (vaErr) {
                  logger.warn(`[DepositService] Paystack DVA generation failed: ${vaErr.message}`);
                  // If we have manual bank details (not the default GENERATING... one), use them
                  if (liveDetails.accountNumber && liveDetails.accountNumber !== "GENERATING...") {
                      liveDetails.note = "Dedicated account unavailable. Using manual settlement. Please upload proof of payment.";
                  } else {
                      // No fallback available, throw the specific error to the user
                      throw vaErr;
                  }
              }
          } else if (["USD", "EUR", "GBP"].includes(upCurrency)) {
              const hasFincra = process.env.FINCRA_SECRET_KEY && process.env.FINCRA_PUBLIC_KEY;
              const isFincraDisabled = process.env.FINCRA_VIRTUAL_ACCOUNTS_DISABLED === "true";

              if (hasFincra && !isFincraDisabled) {
                  const FincraProvider = require("./payment/providers/FincraProvider");
                  const fincra = new FincraProvider();
                  const va = await fincra.createVirtualAccount({
                    currency: upCurrency, 
                    email: profile.email, 
                    firstName, 
                    lastName, 
                    phone: userPhone 
                  });

                  if (va) {
                    liveDetails = {
                      bankName: va.bankName,
                      accountNumber: va.accountNumber,
                      accountName: va.accountName,
                      routingNumber: va.routingNumber || va.swiftCode,
                      note: `Funds are credited after ${upCurrency} settlement (1-3 days)`,
                    };

                    // Store in dedicated_accounts table
                    await supabase.from("dedicated_accounts").insert({
                        user_id: userId,
                        provider: "fincra",
                        provider_account_id: String(va.id || ""),
                        bank_name: va.bankName,
                        account_number: va.accountNumber,
                        account_name: va.accountName,
                        currency: upCurrency,
                        metadata: { routingNumber: va.routingNumber, swiftCode: va.swiftCode }
                    });
                  }
              }
          }
      }
  } catch (err) {
      logger.error(`[DepositService] Dedicated account resolution failed: ${err.message}`);
      // If NGN and we still have "Dynamic Account", we should probably throw or return a better error
      if (upCurrency === "NGN" && liveDetails.accountNumber === "GENERATING...") {
          throw new Error(`Failed to generate your secure NGN transfer account: ${err.message}. Please try again or use Card payment.`);
      }
  }

  const limit = await checkDailyLimit(userId, userPlan, amount);
  if (!limit.allowed) { throw new Error("Daily limit exceeded."); }

  let payment;
  try {
    payment = await PaymentService.initializePayment(
      userId,
      profile?.email || "",
      amount,
      currency,
      {
        type: toCurrency && toCurrency !== currency ? "Digital Assets Purchase" : "DEPOSIT",
        method: "bank_transfer",
        userPlan,
        idempotencyKey,
        targetCurrency: toCurrency,
        targetNetwork: toNetwork,
      },
      { isCrypto: false, manualReview: true },
    );

    if (payment && payment.instructions) {
      liveDetails = {
        bankName: payment.instructions.bank_name,
        accountNumber: payment.instructions.account_number,
        accountName: payment.instructions.account_name,
        swiftCode: payment.instructions.swift_code || null,
        iban: payment.instructions.iban || null,
        routingNumber: payment.instructions.routing_number || payment.instructions.sort_code || null,
        note: payment.instructions.additional_info || payment.instructions.critical_warning || "Include reference in transfer narration",
      };
    } 
  } catch (payErr) {
    payment = { reference: idempotencyKey || `manual_${uuidv4().substring(0, 8)}`, provider: "manual" };
  }

  return {
    reference: payment.reference,
    amount: math.formatForCurrency(amount, currency),
    currency,
    bankDetails: {
      ...liveDetails,
      accountName: liveDetails.accountName + (upCurrency !== "NGN" ? " / " + (payment.provider_reference || payment.reference) : ""),
      reference: payment.provider_reference || payment.reference,
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Initialize a crypto deposit
 */
async function initializeCryptoDeposit(userId, currency, amount = 10, userPlan = "FREE", idempotencyKey = null) {
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).single();
  if (!profile || !profile.email) { throw new Error("User profile not found"); }

  const limit = await checkDailyLimit(userId, userPlan, amount);
  if (!limit.allowed) { throw new Error("Daily limit exceeded."); }

  return await PaymentService.initializePayment(userId, profile.email, amount, currency, { type: "Digital Assets Purchase", userPlan, idempotencyKey }, { isCrypto: true });
}

async function getCryptoDepositAddress(userId, currency) {
  return await initializeCryptoDeposit(userId, currency, 10);
}

async function confirmDeposit(reference, externalHash = null) {
  const { data: tx, error: findError } = await supabase
    .from("transactions")
    .select("*, wallet:wallets(id, user_id, balance, currency)")
    .or(`reference_id.eq.${reference},metadata->>display_ref.eq.${reference}`)
    .single();

  if (findError || !tx) { throw new Error("Transaction not found"); }
  if (tx.status === "COMPLETED") { return { success: true, amount: tx.amount, currency: tx.currency, alreadyProcessed: true }; }
  
  const { data: applied, error: rpcError } = await supabase.rpc("confirm_deposit", {
    p_transaction_id: tx.id,
    p_wallet_id: tx.wallet_id,
    p_amount: tx.amount,
    p_external_hash: externalHash,
  });

  if (rpcError) { throw new Error(`Failed to confirm: ${rpcError.message}`); }

  // If already processed (applied = false), we still return success but don't re-notify
  if (applied === false) {
    return { success: true, amount: tx.amount, currency: tx.currency, alreadyProcessed: true };
  }

  try {
    const { createNotification } = require("./notificationService");
    await createNotification({
      receiverId: tx.wallet.user_id,
      type: "wallet_deposit",
      title: "Deposit Confirmed",
      message: `Your deposit of ${tx.amount} ${tx.currency} has been confirmed.`,
      link: "/dashboard/wallet",
    });
  } catch (nErr) {
    logger.warn(`[DepositService] Notification skipped for ${tx.id}: ${nErr.message}`);
  }

  return { success: true, amount: tx.amount, currency: tx.currency, walletId: tx.wallet_id };
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
  const { data: tx, error } = await supabase.from("transactions").select("id, status, amount, currency, created_at, updated_at").or(`reference_id.eq.${reference},metadata->>display_ref.eq.${reference}`).single();
  return error || !tx ? null : tx;
}

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
