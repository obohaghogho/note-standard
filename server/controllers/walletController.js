const FiatWalletService = require("../services/FiatWalletService");
const CryptoWalletService = require("../services/CryptoWalletService");
const FiatPaymentService = require("../services/FiatPaymentService");
const TransferService = require("../services/TransferService");
const supabase = require("../config/database");

/**
 * Wallet Controller
 * Handles user wallet operations.
 */
exports.getBalances = async (req, res, next) => {
  try {
    const fiatWallets = await FiatWalletService.getWallets(req.user.id);
    const cryptoWallets = await CryptoWalletService.getWallets(req.user.id);
    
    // Ensure fiat list doesn't accidentally contain crypto due to case sensitivity
    const cryptoCurrencies = ["BTC", "ETH", "USDT", "USDC"];
    const filteredFiat = fiatWallets.filter(w => !cryptoCurrencies.includes(String(w.currency).toUpperCase()));
    
    const allWallets = [...filteredFiat, ...cryptoWallets];
    
    // Deduplicate by currency and network
    const uniqueWallets = [];
    const seen = new Set();
    
    for (const w of allWallets) {
      const key = `${String(w.currency).toUpperCase()}_${String(w.network || 'NATIVE').toUpperCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueWallets.push(w);
      } else {
        // If we see a duplicate, prefer the one with a higher balance or actual address
        const existingIdx = uniqueWallets.findIndex(ew => `${String(ew.currency).toUpperCase()}_${String(ew.network || 'NATIVE').toUpperCase()}` === key);
        if (existingIdx >= 0) {
           const existing = uniqueWallets[existingIdx];
           const existingBal = existing.balances?.available || existing.balance || 0;
           const newBal = w.balances?.available || w.balance || 0;
           if (newBal > existingBal) {
               uniqueWallets[existingIdx] = w;
           }
        }
      }
    }
    
    res.json(uniqueWallets);
  } catch (err) {
    next(err);
  }
};

exports.deposit = async (req, res, next) => {
  try {
    const { amount, currency, provider, network: reqNetwork, targetNetwork, idempotencyKey } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({ error: "Amount and currency are required" });
    }

    // Isolate crypto deposits
    const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(String(currency).toUpperCase());
    if (isCrypto) {
      const providerNetwork = (provider && provider !== "fincra" && provider !== "paystack" && provider !== "fiat" && provider !== "nowpayments") ? provider : null;
      const network = reqNetwork || targetNetwork || providerNetwork || "native";
      const result = await CryptoWalletService.deposit(
        req.user.id,
        currency,
        network,
        amount,
        req.userProfile?.plan || "FREE",
        idempotencyKey
      );
      return res.json(result);
    } else {
      const paymentService = require("../services/payment/paymentService");
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', req.user.id).single();
      const email = profile?.email || 'user@example.com';

      const result = await paymentService.initializePayment(
        req.user.id,
        email,
        amount,
        currency,
        {
          channel: "card",
          plan: req.userProfile?.plan || "FREE"
        },
        { provider: (provider && provider !== "paystack" && provider !== "fincra" && provider !== "fiat") ? provider : null }
      );
      return res.json(result);
    }
  } catch (err) {
    if (err.message && (
      err.message.includes("limit") ||
      err.message.includes("network") ||
      err.message.includes("disabled") ||
      err.message.includes("required") ||
      err.message.includes("forbidden") ||
      err.message.includes("exceeded") ||
      err.message.includes("minimal") ||
      err.message.includes("minimum") ||
      err.message.includes("Minimum")
    )) {
      const friendlyMessage = err.message.includes("minimal")
        ? `Minimum deposit amount for ${req.body.currency || 'crypto'} is $15. Please enter $15 or higher.`
        : err.message;
      return res.status(400).json({ error: friendlyMessage });
    }
    next(err);
  }
};

// ── Shared helper: sanitise an HTTP Origin header value
// Mobile WebViews and some Android browsers send origin=null or the literal
// string "null" / "undefined" — treat all of these as missing.
function sanitiseOrigin(rawOrigin, fallback) {
  if (
    !rawOrigin ||
    rawOrigin === 'null' ||
    rawOrigin === 'undefined' ||
    !rawOrigin.startsWith('http')
  ) {
    return fallback;
  }
  return rawOrigin;
}

// REMOVED: safeProactiveCredit helper — replaced by DepositCreditEngine
// All proactive credit attempts now go through the unified engine.

exports.depositCard = async (req, res, next) => {
  try {
    let { amount, currency, toCurrency, toNetwork } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        error: "Amount and currency are required",
      });
    }

    currency = String(currency).replace(/"/g, "");

    const CurrencyFeatureService = require("../services/payment/CurrencyFeatureService");
    const isAdmin = req.user?.role === 'admin' || req.user?.is_admin === true;
    if (!CurrencyFeatureService.canDeposit(currency, isAdmin)) {
      return res.status(403).json({ success: false, error: "Currency not yet available." });
    }

    const upperCurrency = String(currency).toUpperCase();
    const cardSupportedCurrencies = ["NGN", "USD", "ZAR", "GHS"];
    if (!cardSupportedCurrencies.includes(upperCurrency)) {
      return res.status(400).json({
        error: `Card deposits are not supported for ${upperCurrency}. Please use ${upperCurrency === 'EUR' ? 'SEPA Transfer' : upperCurrency === 'GBP' ? 'UK Faster Payments' : 'Bank Transfer'}.`
      });
    }

    const paymentService = require("../services/payment/paymentService");
    
    // Robust Email Resolution: Prefer req.user.email (from Auth token), then userProfile, then database query
    const { data: profile } = await supabase.from('profiles').select('email, full_name, username').eq('id', req.user.id).maybeSingle();
    let email = req.user?.email || req.userProfile?.email || profile?.email;

    if (!email || email === 'user@example.com' || !email.includes('@')) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(req.user.id);
        if (authUser?.user?.email) {
          email = authUser.user.email;
        }
      } catch (authErr) {
        console.warn("[WalletController] Auth user email fallback warning:", authErr.message);
      }
    }

    if (!email || !email.includes('@') || email.endsWith('@example.com')) {
      return res.status(400).json({ error: "A valid account email is required for card deposits. Please verify your profile email." });
    }

    const customerName = req.userProfile?.full_name || 
      profile?.full_name || 
      req.user?.user_metadata?.full_name || 
      req.user?.user_metadata?.name || 
      `${(profile?.username || email.split('@')[0] || 'User')} Standard`;

    const defaultOrigin = process.env.FRONTEND_URL || 'https://notestandard.com';
    const callbackUrl = `${sanitiseOrigin(req.headers.origin, defaultOrigin)}/payment/callback`;

    const upCurr = String(currency).toUpperCase();
    const chosenProvider = req.body.provider || 'fincra';

    const result = await paymentService.initializePayment(
      req.user.id,
      email,
      amount,
      currency,
      {
        channel: "card",
        method: "card",
        plan: req.userProfile?.plan || "FREE",
        targetCurrency: toCurrency,
        targetNetwork: toNetwork,
        callbackUrl: callbackUrl,
        customerName: customerName
      },
      { provider: chosenProvider }
    );

    // Return the structure expected by the frontend
    res.json({
      ...result,
      success: true,
      data: result // Legacy compatibility
    });
  } catch (error) {
    console.error("[WalletController] Card Deposit Error:", error);
    const isValidationError = error.message.includes("limit") ||
      error.message.includes("Maximum") ||
      error.message.includes("must not exceed") ||
      error.message.includes("unavailable") ||
      error.message.includes("available") ||
      error.message.includes("business") ||
      error.message.includes("not supported");

    if (isValidationError) {
      return res.status(400).json({ error: error.message });
    }

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message || "Internal Server Error",
      details: error.response?.data || error.details || error.message,
      location: "walletController.depositCard"
    });
  }
};

exports.depositTransfer = async (req, res, next) => {
  try {
    let { amount, currency, toCurrency, toNetwork } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        error: "Amount and currency are required",
      });
    }

    currency = String(currency).replace(/"/g, "");

    const CurrencyFeatureService = require("../services/payment/CurrencyFeatureService");
    const isAdmin = req.user?.role === 'admin' || req.user?.is_admin === true;
    if (!CurrencyFeatureService.canDeposit(currency, isAdmin)) {
      return res.status(403).json({ success: false, error: "Currency not yet available." });
    }

    const paymentService = require("../services/payment/paymentService");
    
    // Robust Email Resolution
    const { data: profile } = await supabase.from('profiles').select('email, full_name, username').eq('id', req.user.id).maybeSingle();
    let email = req.user?.email || req.userProfile?.email || profile?.email;

    if (!email || email === 'user@example.com' || !email.includes('@')) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(req.user.id);
        if (authUser?.user?.email) {
          email = authUser.user.email;
        }
      } catch (authErr) {
        console.warn("[WalletController] Auth user email fallback warning:", authErr.message);
      }
    }

    if (!email || !email.includes('@') || email.endsWith('@example.com')) {
      return res.status(400).json({ error: "A valid account email is required for bank transfers. Please verify your profile email." });
    }

    const customerName = req.userProfile?.full_name || 
      profile?.full_name || 
      req.user?.user_metadata?.full_name || 
      req.user?.user_metadata?.name || 
      `${(profile?.username || email.split('@')[0] || 'User')} Standard`;

    const defaultOrigin = process.env.FRONTEND_URL || 'https://notestandard.com';
    const callbackUrl = `${sanitiseOrigin(req.headers.origin, defaultOrigin)}/payment/callback`;

    const upCurr = String(currency).toUpperCase();
    const chosenProvider = req.body.provider || (['USD', 'EUR', 'GBP'].includes(upCurr) ? 'grey' : 'fincra');

    const BankingProviderRouter = require("../services/settlement/BankingProviderRouter");
    const instructions = await BankingProviderRouter.getDepositInstructions({
      currency: upCurr,
      rail: "BANK_TRANSFER",
      userId: req.user.id
    });

    if (['NGN', 'GHS'].includes(upCurr) || chosenProvider === 'fincra') {
      const normalizedBankDetails = {
        bankName: instructions.account.bank_name || process.env.FINCRA_BANK_NAME || 'Guaranty Trust Bank',
        accountName: instructions.account.holder || process.env.FINCRA_ACCOUNT_NAME || 'JOSSY DIGITAL TECHNOLOGIES LTD',
        accountNumber: instructions.account.number || process.env.FINCRA_ACCOUNT_NUMBER || '5000701121',
        bankCode: instructions.account.bank_code || process.env.FINCRA_BANK_CODE || '058',
        accountType: instructions.account.type || 'Virtual Account',
        reference: instructions.reference.code,
        note: instructions.notices ? instructions.notices[0] : `Transfer ${upCurr} only from a valid bank account. Include your unique reference in transfer narration.`
      };

      // Ensure a pending transaction and manual deposit record exist in DB so proof submissions & webhooks can match
      try {
        const walletService = require("../services/walletService");
        const wallet = await walletService.createWallet(req.user.id, upCurr, 'native');
        if (wallet && wallet.id) {
          const depositAmount = parseFloat(amount) || 0;
          const refCode = instructions.reference.code;

          // Check if pending transaction already exists
          const { data: existingTx } = await supabase
            .from("transactions")
            .select("id")
            .eq("reference_id", refCode)
            .maybeSingle();

          if (!existingTx) {
            await supabase.from("transactions").insert({
              user_id: req.user.id,
              wallet_id: wallet.id,
              amount: depositAmount,
              currency: upCurr,
              type: 'DEPOSIT',
              status: 'PENDING',
              payment_status: 'PAYMENT_PENDING',
              receipt_status: 'NOT_PROVIDED',
              wallet_credit_status: 'WALLET_CREDIT_PENDING',
              idempotency_key: refCode,
              reference_id: refCode,
              provider: 'fincra',
              display_label: `${upCurr} Bank Transfer Deposit`,
              metadata: {
                display_ref: refCode,
                provider: 'fincra',
                account_number: normalizedBankDetails.accountNumber,
                bank_name: normalizedBankDetails.bankName,
                created_via: 'depositTransfer'
              }
            }).catch(txErr => console.warn("[WalletController] Deposit tx pre-create warning:", txErr.message));
          }

          // Also record in manual_deposits if not exists
          const { data: existingManual } = await supabase
            .from("manual_deposits")
            .select("id")
            .eq("reference", refCode)
            .maybeSingle();

          if (!existingManual) {
            await supabase.from("manual_deposits").insert({
              user_id: req.user.id,
              amount: depositAmount,
              currency: upCurr,
              reference: refCode,
              status: 'pending'
            }).catch(mErr => console.warn("[WalletController] Manual deposit pre-create warning:", mErr.message));
          }
        }
      } catch (prepErr) {
        console.warn(`[WalletController] Pre-creation of ${upCurr} deposit record warning:`, prepErr.message);
      }

      return res.json({
        success: true,
        provider: 'FINCRA',
        currency: upCurr,
        bankDetails: normalizedBankDetails,
        instructions
      });
    }

    const result = await paymentService.initializePayment(
      req.user.id,
      email,
      amount,
      currency,
      {
        channel: "bank_transfer",
        method: "bank_transfer",
        plan: req.userProfile?.plan || "FREE",
        targetCurrency: toCurrency,
        targetNetwork: toNetwork,
        callbackUrl: callbackUrl,
        customerName: customerName
      },
      { provider: chosenProvider }
    );

    const UserBankReferenceService = require("../services/payment/UserBankReferenceService");
    const persistentRef = await UserBankReferenceService.getOrCreateUserReference(req.user.id, chosenProvider);

    const normalizedBankDetails = {
      bankName: result.instructions?.account?.bank_partner || result.bankDetails?.bankName || process.env.GREY_LEAD_BANK_NAME || 'Lead Bank',
      accountName: result.instructions?.account?.holder || result.bankDetails?.accountName || process.env.GREY_LEAD_BANK_ACCOUNT_HOLDER || 'JOSSY DIGITAL TECHNOLOGIES LTD',
      accountNumber: result.instructions?.account?.number || result.bankDetails?.accountNumber || process.env.GREY_LEAD_BANK_ACCOUNT_NUMBER || '217394889898',
      routingNumber: result.instructions?.account?.ach_routing || result.bankDetails?.achRouting || process.env.GREY_LEAD_BANK_ACH_ROUTING || '101019644',
      achRouting: result.instructions?.account?.ach_routing || result.bankDetails?.achRouting || process.env.GREY_LEAD_BANK_ACH_ROUTING || '101019644',
      wireRouting: result.instructions?.account?.wire_routing || result.bankDetails?.wireRouting || process.env.GREY_LEAD_BANK_WIRE_ROUTING || '101019644',
      bankAddress: result.instructions?.account?.address || result.bankDetails?.bankAddress || process.env.GREY_LEAD_BANK_ADDRESS || '1801 Main St., Kansas City, MO 64108, United States',
      accountType: result.instructions?.account?.type || result.bankDetails?.accountType || 'Checking',
      reference: persistentRef,
      note: 'USD payments can only be received from banks within the United States. Include your permanent reference in transfer details.'
    };

    res.json({
      ...result,
      provider: chosenProvider.toUpperCase(),
      bankDetails: normalizedBankDetails,
      instructions: result.instructions || {
        provider: { name: "GREY", bank_partner: normalizedBankDetails.bankName },
        account: {
          holder: normalizedBankDetails.accountName,
          number: normalizedBankDetails.accountNumber,
          type: normalizedBankDetails.accountType,
          ach_routing: normalizedBankDetails.achRouting,
          wire_routing: normalizedBankDetails.wireRouting,
          address: normalizedBankDetails.bankAddress
        },
        reference: { code: persistentRef, persistent: true },
        limits: { minimum: 10, maximum: 50000 },
        supported: { ach: true, wire: true, swift: false },
        fees: { ach: 2, wire: 15 }
      },
      success: true 
    });
  } catch (error) {
    console.error("[WalletController] Bank Transfer Error:", error);
    const isValidationError = error.message.includes("limit") ||
      error.message.includes("Maximum") ||
      error.message.includes("must not exceed") ||
      error.message.includes("unavailable") ||
      error.message.includes("available") ||
      error.message.includes("business") ||
      error.message.includes("not supported");

    if (isValidationError) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({
      error: error.message || "Internal Server Error",
      details: error.response?.data || error.details || error.message,
      location: "walletController.depositTransfer"
    });
  }
};

exports.submitDepositProof = async (req, res) => {
  try {
    const { reference, proof_url, amount, currency } = req.body;

    if (!reference || !proof_url) {
      return res.status(400).json({ error: "Reference and Proof URL are required" });
    }

    const reqCurrency = (currency || "NGN").toUpperCase();
    const reqAmount = parseFloat(amount || 0);
    const userId = req.user.id;

    let { data: tx } = await supabase
      .from("transactions")
      .select("*")
      .or(`reference_id.eq.${reference},metadata->>display_ref.eq.${reference}`)
      .maybeSingle();

    const depositAmount = reqAmount || parseFloat(tx?.amount || 0);

    const walletService = require("../services/walletService");
    const wallet = await walletService.createWallet(userId, reqCurrency, 'native');

    // 1. Update transaction record with UPLOADED receipt status (independent of wallet credit)
    if (!tx) {
      const { data: newTx } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          wallet_id: wallet.id,
          amount: depositAmount,
          currency: reqCurrency,
          type: "DEPOSIT",
          status: "PENDING",
          payment_status: "PAYMENT_PENDING",
          receipt_status: "UPLOADED",
          wallet_credit_status: "WALLET_CREDIT_PENDING",
          receipt_url: proof_url,
          reference_id: reference,
          provider: "fincra",
          display_label: `${reqCurrency} Bank Deposit`,
          metadata: {
            display_ref: reference,
            proof_url,
            proof_submitted_at: new Date().toISOString(),
          }
        })
        .select()
        .single();
      tx = newTx;
    } else {
      await supabase
        .from("transactions")
        .update({
          receipt_status: "UPLOADED",
          receipt_url: proof_url,
          metadata: {
            ...(tx.metadata || {}),
            proof_url,
            proof_submitted_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString()
        })
        .eq("id", tx.id);
    }

    // 2. Sync to manual_deposits table
    try {
      const { data: existingManual } = await supabase
        .from("manual_deposits")
        .select("id")
        .eq("reference", reference)
        .maybeSingle();

      if (!existingManual) {
        await supabase.from("manual_deposits").insert({
          user_id: userId,
          amount: depositAmount,
          currency: reqCurrency,
          reference,
          proof_url,
          status: "pending",
          admin_notes: "Proof attached by user"
        });
      } else {
        await supabase.from("manual_deposits")
          .update({
            proof_url,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingManual.id);
      }
    } catch (mErr) {
      console.warn("[WalletController] Manual deposit sync warning:", mErr.message);
    }

    // 3. ALWAYS attempt idempotent credit via DepositCreditEngine.
    // CRITICAL FIX: The old code only credited when payment_status === 'PAYMENT_CONFIRMED',
    // but bank transfers are always created with 'PAYMENT_PENDING', so the credit was NEVER
    // triggered by receipt upload. The DepositCreditEngine has its own idempotency guards
    // (SELECT FOR UPDATE, ledger idempotency key), so calling it is always safe.
    const DepositCreditEngine = require("../services/payment/DepositCreditEngine");
    let creditResult = null;

    if (tx && tx.status !== 'COMPLETED' && tx.wallet_credit_status !== 'WALLET_CREDITED') {
      try {
        // First update the transaction to PAYMENT_CONFIRMED so confirm_deposit RPC
        // allows the state transition (it requires PENDING/PROCESSING/FAILED status).
        if (tx.payment_status === 'PAYMENT_PENDING') {
          await supabase
            .from('transactions')
            .update({
              payment_status: 'PAYMENT_CONFIRMED',
              updated_at: new Date().toISOString(),
            })
            .eq('id', tx.id);
        }

        creditResult = await DepositCreditEngine.credit({
          transactionId: tx.id,
          reference,
          amount: depositAmount,
          currency: reqCurrency,
          userId,
          source: 'USER_RECEIPT_UPLOAD',
          auditMeta: { proof_url: req.body.proof_url },
        });

        if (creditResult.credited) {
          console.log(`[WalletController] ✅ Wallet credited via receipt upload for ${reference}`);
        } else if (creditResult.alreadyCredited) {
          console.log(`[WalletController] Idempotency hit on receipt upload for ${reference}`);
        } else if (creditResult.error) {
          console.error(`[WalletController] Credit engine error for ${reference}: ${creditResult.error}`);
        }
      } catch (creditErr) {
        console.error(`[WalletController] Credit attempt failed for ${reference}:`, creditErr.message);
      }
    }

    res.json({
      success: true,
      message: "Proof of payment submitted successfully!",
      receipt_status: "UPLOADED",
      wallet_credited: creditResult?.credited || false
    });
  } catch (error) {
    console.error("[WalletController] Submit proof error:", error);
    res.status(500).json({ error: error.message || "Failed to submit proof" });
  }
};

exports.getPendingDeposits = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { data: deposits, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "DEPOSIT")
      .neq("wallet_credit_status", "WALLET_CREDITED")
      .neq("status", "COMPLETED")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      deposits: (deposits || []).map(d => ({
        id: d.id,
        reference: d.reference_id || d.provider_reference || d.metadata?.display_ref,
        amount: d.amount,
        currency: d.currency,
        provider: d.provider,
        paymentStatus: d.payment_status || (d.status === 'COMPLETED' ? 'WALLET_CREDITED' : 'PAYMENT_PENDING'),
        receiptStatus: d.receipt_status || (d.metadata?.proof_url ? 'UPLOADED' : 'NOT_PROVIDED'),
        walletCreditStatus: d.wallet_credit_status || (d.status === 'COMPLETED' ? 'WALLET_CREDITED' : 'WALLET_CREDIT_PENDING'),
        reconciliationStatus: d.reconciliation_status || 'NONE',
        receiptUrl: d.receipt_url || d.metadata?.proof_url || null,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }))
    });
  } catch (err) {
    next(err);
  }
};

exports.withdraw = async (req, res) => {
  try {
    const {
      currency,
      amount,
      address,
      bank_code,
      bank_name,
      account_number,
      account_name,
      swift_code,
      branch_code,
      sort_code,
      iban,
      country,
      network,
      idempotencyKey,
    } = req.body;

    const isCrypto = ["BTC", "ETH", "USDT", "USDC", "TRX", "POLYGON"].includes(String(currency).toUpperCase());

    const destination = isCrypto
      ? { address: address, network: network || "native" }
      : {
          bankCode:      bank_code,
          accountNumber: account_number,
          accountName:   account_name,
          bankName:      bank_name,
          country:       country || (currency === "NGN" ? "NG" : "US"),
          swiftCode:     swift_code,
          branchCode:    branch_code,
          sortCode:      sort_code,
          iban:          iban,
        };

    const mappedData = {
      method: isCrypto ? "crypto" : "bank_transfer",
      type:   isCrypto ? "crypto" : "fiat",
      currency,
      amount,
      network: network || "native",
      destination,
      client_idempotency_key: idempotencyKey,
    };

    let result;
    if (isCrypto) {
      const CryptoWalletService = require("../services/CryptoWalletService");
      result = await CryptoWalletService.withdraw(req.user.id, mappedData);
    } else {
      const payoutEngine = require("../withdrawal/payoutEngine");
      const correlationId = req.body.correlationId || req.headers["x-correlation-id"] || req.headers["x-request-id"] || `corr_${Date.now()}`;
      console.log(`[E2E_CORRELATION_TRACE] [${correlationId}] [Stage 2/10] Controller Entry (/api/wallet/withdraw) | User: ${req.user.id}, Amount: ${amount} ${currency}`);

      // Fetch user email to pass to Fincra beneficiary (required by Fincra API)
      const { data: userProfile } = await supabase.from('profiles').select('email').eq('id', req.user.id).single();
      const userEmail = userProfile?.email || req.user?.email || null;

      result = await payoutEngine.processWithdrawal({
        userId: req.user.id,
        amount: parseFloat(amount),
        currency: String(currency).toUpperCase(),
        bankCode: bank_code,
        accountNumber: account_number,
        accountName: account_name,
        userEmail,
        narration: `NoteStandard ${currency} withdrawal`,
        idempotencyKey,
        correlationId,
        ip: req.ip || req.socket?.remoteAddress,
        deviceId: req.headers["x-device-id"] || "browser",
        userAgent: req.headers["user-agent"] || "unknown",
      });
    }
    console.log(`[E2E_CORRELATION_TRACE] [Stage 10/10] Controller Returning Result to Express Response | Payload:`, JSON.stringify(result, null, 2));
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.transfer = async (req, res) => {
  try {
    const result = await TransferService.transferInternal(
      req.user.id,
      req.userProfile?.plan,
      req.body,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createWallet = async (req, res) => {
  try {
    const { currency, network } = req.body;
    const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(String(currency).toUpperCase());
    
    let wallet;
    if (isCrypto) {
      wallet = await CryptoWalletService.createWallet(req.user.id, currency, network);
    } else {
      wallet = await FiatWalletService.createWallet(req.user.id, currency);
    }
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAddress = async (req, res) => {
  try {
    const isPost = req.method === "POST";
    const { currency, network } = isPost ? req.body : req.query;
    
    if (!currency) throw new Error("Currency is required");
    
    const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(String(currency).toUpperCase());
    let result;
    if (isCrypto) {
      result = await CryptoWalletService.getAddress(req.user.id, currency, network || "native", isPost);
    } else {
      const wallet = await FiatWalletService.createWallet(req.user.id, currency);
      result = { address: wallet.address, currency: wallet.currency, network: "NATIVE" };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getLedger = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    // ── Task: V6 Ledger Activity Integration ─────────────────────
    // Fetch directly from the sovereign v6 ledger to ensure 
    // real-time activity reflection.
    const { data, error } = await supabase
      .from("ledger_entries_v6")
      .select(`
        id,
        amount,
        currency,
        created_at,
        side,
        ledger_transactions_v6!inner(
          type,
          status,
          idempotency_key
        )
      `)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Map to legacy format expected by the frontend
    const entries = (data || []).map(item => {
      const rawType = item.ledger_transactions_v6.type;
      const displayType = (rawType === 'TRANSFER' || rawType === 'INTERNAL_TRANSFER') 
        ? 'Digital Assets Purchase' 
        : rawType;

      return {
        id: item.id,
        user_id: req.user.id,
        amount: item.amount,
        currency: item.currency,
        type: displayType,
        activity_type: displayType, // UI uses this for filtering
        status: item.ledger_transactions_v6.status,
        reference: item.ledger_transactions_v6.idempotency_key,
        created_at: item.created_at
      };
    });

    res.json({ entries });
  } catch (err) {
    console.error("[WalletController] getLedger Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getDepositStatus = async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) throw new Error("Reference is required");
    
    const { data: tx, error } = await supabase
      .from("transactions")
      .select("*")
      .or(`reference_id.eq.${reference},metadata->>display_ref.eq.${reference}`)
      .single();

    if (error || !tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Proactively verify pending/failed transactions in case webhook was missed.
    // Uses the unified DepositCreditEngine for all credit operations.
    if (["PENDING", "FAILED"].includes(tx.status)) {
      const DepositCreditEngine = require("../services/payment/DepositCreditEngine");

      // ── Path A: Paystack card deposits — verify directly with Paystack API ──
      if (tx.provider === "paystack") {
        try {
          const PaystackProvider = require("../services/payment/providers/PaystackProvider");
          const provider = new PaystackProvider();
          const verifyResult = await provider.verifyPayment(tx.reference_id);
          
          if (verifyResult.status === "success") {
            const creditResult = await DepositCreditEngine.credit({
              transactionId: tx.id,
              reference:     tx.reference_id,
              providerTxId:  verifyResult.data?.reference || tx.reference_id,
              source:        'DEPOSIT_STATUS_PROACTIVE_PAYSTACK',
            });
            if (creditResult.credited || creditResult.alreadyCredited) {
              return res.json({ status: "COMPLETED", walletCredited: true });
            }
          }
        } catch (pollErr) {
          console.error("[WalletController] Paystack proactive verify failed:", pollErr.message);
        }
      }

      // ── Path B: Fincra bank transfer deposits — check receipt + attempt credit ──
      if (tx.provider === "fincra" && (tx.receipt_status === 'UPLOADED' || tx.metadata?.proof_url)) {
        try {
          // The user uploaded a receipt, so the transfer likely happened.
          // Attempt credit via DepositCreditEngine (idempotent, safe to retry).
          if (tx.payment_status === 'PAYMENT_PENDING') {
            await supabase
              .from('transactions')
              .update({ payment_status: 'PAYMENT_CONFIRMED', updated_at: new Date().toISOString() })
              .eq('id', tx.id);
          }

          const creditResult = await DepositCreditEngine.credit({
            transactionId: tx.id,
            reference:     tx.reference_id || tx.metadata?.display_ref,
            amount:        tx.amount,
            currency:      tx.currency,
            userId:        tx.user_id,
            source:        'DEPOSIT_STATUS_PROACTIVE_FINCRA',
          });
          if (creditResult.credited || creditResult.alreadyCredited) {
            return res.json({ status: "COMPLETED", walletCredited: true });
          }
        } catch (fincraErr) {
          console.error("[WalletController] Fincra proactive credit failed:", fincraErr.message);
        }
      }
    }
    
    res.json({
      status: tx.status,
      paymentStatus: tx.payment_status,
      receiptStatus: tx.receipt_status,
      walletCreditStatus: tx.wallet_credit_status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCommissions = async (req, res) => {
  try {
    const { type, currency } = req.query;

    let query = supabase
      .from("commission_settings")
      .select("*")
      .eq("is_active", true);

    if (type) query = query.eq("transaction_type", type);
    if (currency) query = query.or(`currency.eq.${currency},currency.is.null`);

    const { data: commissions, error } = await query.order("currency", {
      ascending: false,
    });

    if (error) throw error;
    res.json({ commissions: commissions || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMyAffiliateStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch referrals where user is the referrer
    const { data: referrals, error: refErr } = await supabase
      .from("affiliate_referrals")
      .select(`
        id,
        created_at,
        total_commission_earned,
        commission_percentage,
        referred:profiles!referred_user_id(username, email, avatar_url, created_at)
      `)
      .eq("referrer_user_id", userId)
      .order("created_at", { ascending: false });

    if (refErr) throw refErr;

    // 2. Get global commission rate setting
    const { data: commissionRateSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "affiliate_percentage")
      .maybeSingle();

    let rate = 10; // Default 10%
    if (commissionRateSetting && commissionRateSetting.value != null) {
      const rawVal = typeof commissionRateSetting.value === "string"
        ? commissionRateSetting.value.replace(/"/g, "")
        : commissionRateSetting.value;
      const parsed = parseFloat(rawVal);
      if (!isNaN(parsed)) {
        // If stored as 0.1 (decimal fraction for 10%), scale to percentage
        rate = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
      }
    }

    // 3. Compute total commission earned across all referrals
    const totalEarned = (referrals || []).reduce(
      (sum, r) => sum + (parseFloat(r.total_commission_earned) || 0),
      0
    );

    // 4. Get profile username for referral code
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();

    const referralCode = profile?.username || userId.slice(0, 8);
    const clientUrl = process.env.CLIENT_URL || "https://app.notestandard.com";

    res.json({
      success: true,
      referrals: referrals || [],
      totalEarned,
      totalReferrals: (referrals || []).length,
      commissionRate: rate,
      referral_code: referralCode,
      referral_link: `${clientUrl}/signup?ref=${userId}`,
    });
  } catch (err) {
    console.error("[WalletController] getMyAffiliateStats error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/wallet/limit-request - Allow a user to request a limit increase
 */
exports.createLimitRequest = async (req, res) => {
  try {
    const { requested_limit, reason } = req.body;

    if (!requested_limit || isNaN(requested_limit) || requested_limit <= 0) {
      return res.status(400).json({ error: "Please enter a valid requested limit." });
    }

    // 1. Check if there's already a pending request
    const { data: existing, error: checkErr } = await supabase
      .from("limit_requests")
      .select("id")
      .eq("user_id", req.user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (checkErr && checkErr.code !== "PGRST116" && !checkErr.message.includes("does not exist")) {
       console.error("[WalletController] limit_requests table check failed:", checkErr.message);
       throw checkErr;
    }

    if (existing) {
      return res.status(400).json({ error: "You already have a pending limit increase request." });
    }

    // 2. Create the request
    const { error: insertErr } = await supabase
      .from("limit_requests")
      .insert([{
        user_id: req.user.id,
        requested_limit: parseFloat(requested_limit),
        reason: reason || "Standard transaction limit increase",
        status: "pending",
        created_at: new Date().toISOString()
      }]);

    if (insertErr) {
      console.error("[WalletController] insert limit_request error:", insertErr);
      throw new Error("Failed to submit request. Please try again later or contact support.");
    }

    res.json({ success: true, message: "Your limit increase request has been submitted for review." });
  } catch (err) {
    console.error("[WalletController] createLimitRequest error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// WALLET HUB ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

const walletCurrencyCatalog = require('../config/walletCurrencyCatalog');

/**
 * GET /wallet/hub
 * Returns a unified view of the user's wallet hub:
 *   - Fiat wallets with balances + catalog metadata
 *   - Crypto wallets with balances + catalog metadata
 *   - Currency catalog (for UI rendering)
 *   - Recent activity (last 10 ledger entries)
 *   - Portfolio summary totals
 */
exports.getHubView = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch wallets in parallel
    const [fiatWallets, cryptoWallets, ledgerRes] = await Promise.allSettled([
      FiatWalletService.getWallets(userId),
      CryptoWalletService.getWallets(userId),
      supabase
        .from('ledger_entries')
        .select('id, amount, currency, activity_type, status, reference, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const fiat   = fiatWallets.status   === 'fulfilled' ? fiatWallets.value   : [];
    const crypto = cryptoWallets.status === 'fulfilled' ? cryptoWallets.value : [];
    const ledger = ledgerRes.status     === 'fulfilled' ? (ledgerRes.value?.data || []) : [];

    // Load catalog (DB-first, static fallback)
    let catalogFiat   = walletCurrencyCatalog.FIAT_CATALOG;
    let catalogCrypto = walletCurrencyCatalog.CRYPTO_CATALOG;

    try {
      const { data: dbCatalog } = await supabase
        .from('supported_currencies')
        .select('*')
        .order('display_order', { ascending: true });

      if (dbCatalog && dbCatalog.length > 0) {
        catalogFiat   = dbCatalog.filter(c => c.type === 'fiat');
        catalogCrypto = dbCatalog.filter(c => c.type === 'crypto');
      }
    } catch {
      // Use static defaults above
    }

    // Merge catalog metadata into wallet rows
    const cryptoCurrencies = new Set(['BTC', 'ETH', 'USDT', 'USDC']);

    const enrichedFiat = catalogFiat.map(meta => {
      const wallet = fiat.find(w => w.currency?.toUpperCase() === meta.code) || {};
      return {
        ...meta,
        balance:           parseFloat(wallet.balance)                           || 0,
        available_balance: parseFloat(wallet.balances?.available ?? wallet.balance) || 0,
        pending_balance:   parseFloat(wallet.balances?.pending   ?? 0)          || 0,
        locked_balance:    parseFloat(wallet.balances?.locked    ?? 0)          || 0,
        wallet_exists:     !!wallet.id,
        wallet_id:         wallet.id || null,
      };
    });

    const enrichedCrypto = catalogCrypto.map(meta => {
      const wallet = crypto.find(w => w.currency?.toUpperCase() === meta.code) || {};
      return {
        ...meta,
        balance:           parseFloat(wallet.balance)                           || 0,
        available_balance: parseFloat(wallet.balances?.available ?? wallet.balance) || 0,
        pending_balance:   parseFloat(wallet.balances?.pending   ?? 0)          || 0,
        address:           wallet.address   || null,
        network:           wallet.network   || 'native',
        wallet_exists:     !!wallet.id,
        wallet_id:         wallet.id || null,
      };
    });

    res.json({
      fiatWallets:    enrichedFiat,
      cryptoWallets:  enrichedCrypto,
      currencyCatalog: { fiat: catalogFiat, crypto: catalogCrypto },
      recentActivity: ledger,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /wallet/currencies
 * Returns the currency catalog. DB-first, static fallback if DB is empty.
 * Used by the frontend to determine UI capabilities per currency.
 */
exports.getCurrencyCatalog = async (req, res, next) => {
  try {
    // Try DB first
    const { data: dbCatalog, error } = await supabase
      .from('supported_currencies')
      .select('*')
      .order('display_order', { ascending: true });

    if (!error && dbCatalog && dbCatalog.length > 0) {
      return res.json({
        fiat:   dbCatalog.filter(c => c.type === 'fiat'),
        crypto: dbCatalog.filter(c => c.type === 'crypto'),
        source: 'database',
      });
    }

    // Env-var / static fallback
    res.json({
      fiat:   walletCurrencyCatalog.FIAT_CATALOG,
      crypto: walletCurrencyCatalog.CRYPTO_CATALOG,
      source: 'static',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /wallet/portfolio
 * Returns a portfolio summary: total value in USD, fiat vs crypto split,
 * available/locked/pending breakdown.
 * Note: 24h change is a best-effort estimate using cached rate snapshots.
 */
exports.getPortfolioSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [fiatWallets, cryptoWallets] = await Promise.all([
      FiatWalletService.getWallets(userId).catch(() => []),
      CryptoWalletService.getWallets(userId).catch(() => []),
    ]);

    const allWallets = [...fiatWallets, ...cryptoWallets];

    // Fetch exchange rates
    let rates = {};
    try {
      const { data } = await supabase
        .from('exchange_rate_cache')
        .select('currency, rate_usd')
        .limit(50);
      if (data) {
        for (const row of data) rates[row.currency] = parseFloat(row.rate_usd);
      }
    } catch {
      // rates will be empty — totals will be 0 but no crash
    }

    const toUSD = (amount, currency) => {
      const c = currency?.toUpperCase();
      if (c === 'USD') return parseFloat(amount) || 0;
      const r = rates[c];
      if (!r || r <= 0) return 0;
      return (parseFloat(amount) || 0) * r;
    };

    let fiatTotalUSD = 0;
    let cryptoTotalUSD = 0;
    let available = 0;
    let locked = 0;
    let pending = 0;

    const cryptoCodes = new Set(['BTC', 'ETH', 'USDT', 'USDC']);

    for (const w of allWallets) {
      const currency = (w.currency || '').toUpperCase();
      const bal      = parseFloat(w.balance || 0);
      const avail    = parseFloat(w.balances?.available ?? w.balance ?? 0);
      const pend     = parseFloat(w.balances?.pending ?? 0);
      const lck      = parseFloat(w.balances?.locked  ?? 0);
      const usdVal   = toUSD(bal, currency);

      if (cryptoCodes.has(currency)) cryptoTotalUSD += usdVal;
      else fiatTotalUSD += usdVal;

      available += toUSD(avail, currency);
      pending   += toUSD(pend,  currency);
      locked    += toUSD(lck,   currency);
    }

    const totalUSD = fiatTotalUSD + cryptoTotalUSD;

    res.json({
      totalUSD:      Math.round(totalUSD    * 100) / 100,
      fiatTotalUSD:  Math.round(fiatTotalUSD  * 100) / 100,
      cryptoTotalUSD:Math.round(cryptoTotalUSD* 100) / 100,
      available:     Math.round(available   * 100) / 100,
      locked:        Math.round(locked      * 100) / 100,
      pending:       Math.round(pending     * 100) / 100,
      change24h:     null, // populated by a snapshot job in future
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /wallet/internal-transfer
 * Moves funds between a user's own wallets using SwapService.
 * Supports: fiat→crypto, crypto→fiat, fiat→fiat, crypto→crypto.
 *
 * Body: { fromCurrency, toCurrency, amount, idempotencyKey }
 */
exports.internalTransfer = async (req, res, next) => {
  try {
    const { fromCurrency, toCurrency, amount, idempotencyKey } = req.body;
    const userId = req.user.id;

    if (!fromCurrency || !toCurrency || !amount) {
      return res.status(400).json({ error: 'fromCurrency, toCurrency, and amount are required.' });
    }
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      return res.status(400).json({ error: 'Source and destination currencies must differ.' });
    }
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero.' });
    }

    const key = idempotencyKey || `int_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    // Delegate to SwapService — it handles the atomic ledger mutation
    const SwapService = require('../services/swapService');
    const preview = await SwapService.calculateSwap({
      userId,
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency:   toCurrency.toUpperCase(),
      fromAmount:   parseFloat(amount),
      fromNetwork:  'native',
      toNetwork:    'native',
    });

    const result = await SwapService.executeSwap({
      userId,
      lockId:        preview.lockId,
      idempotencyKey: key,
    });

    res.json({
      success: true,
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency:   toCurrency.toUpperCase(),
      fromAmount:   parseFloat(amount),
      toAmount:     result.to_amount,
      rate:         result.rate,
      fee:          result.fee,
      transactionId: result.transaction_id,
    });
  } catch (err) {
    console.error('[WalletController] internalTransfer error:', err);
    next(err);
  }
};

/**
 * GET /wallet/admin/currencies
 */
exports.adminGetCurrencies = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    const { data, error } = await supabase
      .from('supported_currencies')
      .select('*')
      .order('type', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) {
      console.warn('[AdminCurrency] DB error, using fallback', error);
      const allCurrencies = typeof walletCurrencyCatalog.getAllCurrencies === 'function' 
        ? walletCurrencyCatalog.getAllCurrencies() 
        : [...(walletCurrencyCatalog.FIAT_CATALOG || []), ...(walletCurrencyCatalog.CRYPTO_CATALOG || [])];
      return res.json({ currencies: allCurrencies, source: 'fallback' });
    }
    res.json({ currencies: data });
  } catch (err) {
    console.error('[AdminCurrency] Error', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /wallet/admin/currencies/:code
 */
exports.adminUpdateCurrency = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    const { code } = req.params;
    
    const validKeys = [
      'status', 'deposit_enabled', 'withdraw_enabled', 
      'transfer_enabled', 'buy_enabled', 'sell_enabled', 
      'swap_enabled', 'convert_enabled'
    ];
    
    const validFields = {};
    for (const key of validKeys) {
      if (req.body[key] !== undefined) {
        validFields[key] = req.body[key];
      }
    }
    
    validFields.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('supported_currencies')
      .update(validFields)
      .eq('code', code.toUpperCase())
      .select()
      .single();

    if (error) {
      throw error;
    }
    
    console.log('[AdminCurrency] Updated', code, 'by', req.user.id, validFields);
    res.json(data);
  } catch (err) {
    console.error('[AdminCurrency] Error updating', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /wallet/virtual-account/:currency
 */
exports.getVirtualAccount = async (req, res) => {
  try {
    const { currency } = req.params;
    const VirtualAccountService = require("../services/VirtualAccountService");
    const account = await VirtualAccountService.getVirtualAccount(req.user.id, currency);
    if (!account) {
      return res.json({ account: null, status: 'NOT_REQUESTED' });
    }
    res.json({ account, status: account.status });
  } catch (err) {
    console.error("[WalletController] getVirtualAccount Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /wallet/virtual-account
 */
exports.createVirtualAccount = async (req, res) => {
  try {
    const { currency, kycData } = req.body;
    const VirtualAccountService = require("../services/VirtualAccountService");
    const account = await VirtualAccountService.createVirtualAccount(req.user.id, currency, kycData || {});
    res.json({ success: true, account });
  } catch (err) {
    console.error("[WalletController] createVirtualAccount Error:", err);
    if (err.message.includes("MISSING_KYC_DOCUMENTS")) {
      return res.status(400).json({ error: err.message, code: "MISSING_KYC_DOCUMENTS" });
    }
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /wallet/virtual-account/:currency/refresh
 */
exports.refreshVirtualAccount = async (req, res) => {
  try {
    const { currency } = req.params;
    const VirtualAccountService = require("../services/VirtualAccountService");
    const account = await VirtualAccountService.refreshAccountStatus(req.user.id, currency);
    res.json({ success: true, account });
  } catch (err) {
    console.error("[WalletController] refreshVirtualAccount Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /wallet/capabilities
 * Returns versioned payment rail capabilities for all currencies.
 */
exports.getCapabilities = async (req, res) => {
  try {
    const ProviderCapabilityRegistry = require("../services/payment/ProviderCapabilityRegistry");
    const userTier = req.user?.plan_tier || 'FREE';
    const capabilities = await ProviderCapabilityRegistry.getMergedCapabilities(userTier);
    res.json(capabilities);
  } catch (err) {
    console.error("[WalletController] getCapabilities Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /wallet/capabilities/:currency
 * Returns payment rail capabilities for a specific currency.
 */
exports.getCurrencyCapabilities = async (req, res) => {
  try {
    const { currency } = req.params;
    const ProviderCapabilityRegistry = require("../services/payment/ProviderCapabilityRegistry");
    const userTier = req.user?.plan_tier || 'FREE';
    const caps = await ProviderCapabilityRegistry.getCapabilitiesForCurrency(currency, userTier);
    if (!caps) {
      return res.status(404).json({ error: `No payment capabilities found for currency: ${currency}` });
    }
    res.json(caps);
  } catch (err) {
    console.error("[WalletController] getCurrencyCapabilities Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /wallet/user-reference
 * Returns persistent bank reference for current authenticated user.
 */
exports.getUserBankReference = async (req, res) => {
  try {
    const UserBankReferenceService = require("../services/payment/UserBankReferenceService");
    const provider = req.query.provider || 'grey';
    const reference = await UserBankReferenceService.getOrCreateUserReference(req.user.id, provider);
    res.json({ success: true, reference, persistent: true });
  } catch (err) {
    console.error("[WalletController] getUserBankReference Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /wallet/generate-reference
 * Admin / explicit regeneration of a user reference string.
 */
exports.generateUserBankReference = async (req, res) => {
  try {
    const UserBankReferenceService = require("../services/payment/UserBankReferenceService");
    const provider = req.body.provider || 'grey';
    const reference = await UserBankReferenceService.regenerateUserReference(req.user.id, provider);
    res.json({ success: true, reference, persistent: true });
  } catch (err) {
    console.error("[WalletController] generateUserBankReference Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Enterprise Currency Release Management Handlers
 */
const CurrencyReleaseManagerService = require('../services/payment/CurrencyReleaseManagerService');

exports.getCurrencyReleaseDashboard = async (req, res) => {
  try {
    const settings = await CurrencyReleaseManagerService.getAllSettings();
    const auditLogs = await CurrencyReleaseManagerService.getAuditLogs(30);

    const checklists = {};
    for (const c of settings) {
      checklists[c.code] = await CurrencyReleaseManagerService.verifyPreLaunchChecklist(c.code);
    }

    res.json({
      success: true,
      settings,
      checklists,
      auditLogs,
      summary: {
        total: settings.length,
        live: settings.filter(s => s.release_status === 'LIVE').length,
        development: settings.filter(s => s.release_status === 'DEVELOPMENT').length,
        pendingApproval: settings.filter(s => s.release_status === 'PENDING_APPROVAL').length,
        inMaintenance: settings.filter(s => s.health_status === 'MAINTENANCE').length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.requestCurrencyPromotion = async (req, res) => {
  try {
    const { code } = req.params;
    const { reason } = req.body;
    const result = await CurrencyReleaseManagerService.requestPromotion(code, req.user, reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.approveCurrencyPromotion = async (req, res) => {
  try {
    const { code } = req.params;
    const { reason } = req.body;
    const result = await CurrencyReleaseManagerService.approvePromotion(code, req.user, reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.scheduleCurrencyRelease = async (req, res) => {
  try {
    const { code } = req.params;
    const { scheduledAt, reason } = req.body;
    const result = await CurrencyReleaseManagerService.scheduleRelease(code, scheduledAt, req.user, reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.updateCurrencyHealth = async (req, res) => {
  try {
    const { code } = req.params;
    const { healthStatus, maintenanceNotice } = req.body;
    const result = await CurrencyReleaseManagerService.updateHealthStatus(code, healthStatus, maintenanceNotice, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.getCurrencyAuditLogs = async (req, res) => {
  try {
    const logs = await CurrencyReleaseManagerService.getAuditLogs(100);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


/**
 * POST /api/wallet/withdraw
 * Consolidated withdrawal controller delegating to PayoutEngine
 */
exports.withdraw = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const correlationId = req.headers["x-correlation-id"] || req.headers["x-request-id"];
    
    // Normalize payload parameters from both web & mobile formats
    const amount = parseFloat(req.body.amount || 0);
    const currency = (req.body.currency || "NGN").toUpperCase();
    const destination = req.body.destination || {};
    
    const bankCode = req.body.bankCode || req.body.bank_code || destination.bank_code || destination.bankCode || destination.bank_name;
    const accountNumber = req.body.accountNumber || req.body.account_number || destination.account_number || destination.accountNumber;
    const accountName = req.body.accountName || req.body.account_name || destination.account_name || destination.accountName || "Valued Customer";
    const narration = req.body.narration || req.body.description || "NoteStandard Withdrawal";
    const idempotencyKey = req.body.idempotencyKey || req.body.client_idempotency_key;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Withdrawal amount must be greater than 0." });
    }

    if (!accountNumber) {
      return res.status(400).json({ success: false, error: "Account number is required for withdrawal." });
    }

    const payoutEngine = require("../withdrawal/payoutEngine");
    const result = await payoutEngine.processWithdrawal({
      userId,
      amount,
      currency,
      bankCode: bankCode || "058",
      accountNumber,
      accountName,
      narration,
      idempotencyKey,
      correlationId,
      ip: req.ip || req.socket?.remoteAddress,
      deviceId: req.headers["x-device-id"] || "mobile",
      userAgent: req.headers["user-agent"] || "mobile-apk",
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[WalletController] Withdrawal Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/wallet/limits
 * Returns user dynamic deposit and withdrawal daily limits, 24h usage, remaining allowance,
 * and next tier info based on user's KYC tier and plan tier.
 */
exports.getLimits = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, kyc_level, is_verified, plan_tier, daily_deposit_limit, daily_withdrawal_limit")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const currentTier = profile.kyc_level || 0;
    const planTier = String(profile.plan_tier || "FREE").toUpperCase();

    // Standard Tier Limits (USD equivalents)
    // Tier 0: Unverified (Deposit: 50, Withdrawal: 0)
    // Tier 1: Phone Verified (Deposit: 500, Withdrawal: 200)
    // Tier 2: BVN / NIN Verified (Deposit: 5000, Withdrawal: 2500)
    // Tier 3: Full Compliance (Deposit: 50000, Withdrawal: 25000)
    const tierDepositLimits = { 0: 50, 1: 500, 2: 5000, 3: 50000 };
    const tierWithdrawalLimits = { 0: 0, 1: 200, 2: 2500, 3: 25000 };

    let depositLimit = tierDepositLimits[currentTier] ?? 50;
    let withdrawalLimit = tierWithdrawalLimits[currentTier] ?? 0;

    // Apply custom profile overrides if specified
    if (profile.daily_deposit_limit !== null && profile.daily_deposit_limit !== undefined) {
      depositLimit = parseFloat(profile.daily_deposit_limit);
    }
    if (profile.daily_withdrawal_limit !== null && profile.daily_withdrawal_limit !== undefined) {
      withdrawalLimit = parseFloat(profile.daily_withdrawal_limit);
    }

    // Daily limit overall (for mobile card, dailyLimit represents max daily transaction limit)
    const dailyLimit = Math.max(depositLimit, withdrawalLimit);

    // Calculate 24h usage
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [txDepositsRes, txWithdrawalsRes, fincraTxsRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("amount, currency")
        .eq("user_id", userId)
        .eq("status", "COMPLETED")
        .in("type", ["DEPOSIT", "FUNDING", "Digital Assets Purchase"])
        .gte("created_at", twentyFourHoursAgo),

      supabase
        .from("transactions")
        .select("amount, currency")
        .eq("user_id", userId)
        .in("status", ["COMPLETED", "PROCESSING"])
        .in("type", ["WITHDRAWAL", "payout", "withdrawal"])
        .gte("created_at", twentyFourHoursAgo),

      supabase
        .from("fincra_transactions")
        .select("amount, currency")
        .eq("user_id", userId)
        .in("status", ["COMPLETED", "PROCESSING", "RESERVED"])
        .gte("created_at", twentyFourHoursAgo)
    ]);

    const deposits = txDepositsRes.data || [];
    const withdrawals = [...(txWithdrawalsRes.data || []), ...(fincraTxsRes.data || [])];

    const usedDepositToday = deposits.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
    const usedWithdrawalToday = withdrawals.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
    const usedToday = usedWithdrawalToday; // For daily withdrawal card tracking

    const remainingDepositToday = Math.max(0, depositLimit - usedDepositToday);
    const remainingWithdrawalToday = Math.max(0, withdrawalLimit - usedWithdrawalToday);
    const remainingToday = remainingWithdrawalToday;

    const nextTier = currentTier < 3 ? currentTier + 1 : undefined;
    const nextTierLimit = nextTier !== undefined ? (tierWithdrawalLimits[nextTier] || 25000) : undefined;

    res.json({
      success: true,
      currentTier,
      tierName: `Tier ${currentTier}`,
      planTier,
      dailyLimit,
      depositLimit,
      withdrawalLimit,
      usedToday: Math.round(usedToday * 100) / 100,
      remainingToday: Math.round(remainingToday * 100) / 100,
      usedDepositToday: Math.round(usedDepositToday * 100) / 100,
      remainingDepositToday: Math.round(remainingDepositToday * 100) / 100,
      nextTier,
      nextTierLimit,
      currencySymbol: "$"
    });
  } catch (err) {
    console.error("[WalletController] getLimits Error:", err);
    res.status(500).json({ error: err.message });
  }
};



