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
    const { amount, currency, provider } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({ error: "Amount and currency are required" });
    }

    // Isolate crypto deposits
    const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(String(currency).toUpperCase());
    if (isCrypto) {
      const result = await CryptoWalletService.deposit(
        req.user.id,
        currency,
        amount,
        req.userProfile?.plan || "FREE"
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
        { provider: provider || "paystack" }
      );
      return res.json(result);
    }
  } catch (err) {
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

// ── Shared helper: safely credit a wallet for a verified Paystack payment
// This replaces the previous dangerous global singleton monkey-patch.
async function safeProactiveCredit(tx, verifyResult) {
  const FiatWalletService = require('../services/FiatWalletService');
  const AuditLogService   = require('../services/AuditLogService');
  const idempotencyKey = `paystack_proactive_${tx.reference_id}_${tx.id}`;

  // Credit the wallet atomically (idempotency key prevents double-credit)
  const ledgerTxId = await FiatWalletService.fundWallet(
    tx.user_id,
    tx.currency,
    tx.amount,
    idempotencyKey,
    { provider: 'paystack', reference: tx.reference_id, proactive: true }
  );

  // Mark the transaction COMPLETED
  await supabase
    .from('transactions')
    .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
    .eq('id', tx.id);

  // Fire-and-forget audit log
  AuditLogService.log({
    user_id:   tx.user_id,
    action:    'fiat_deposit_proactive_verify',
    provider:  'paystack',
    reference: tx.reference_id,
    amount:    tx.amount,
    currency:  tx.currency,
    ledger_id: ledgerTxId
  }).catch(err => console.warn('[safeProactiveCredit] Audit log failed:', err.message));

  return ledgerTxId;
}

exports.depositCard = async (req, res, next) => {
  try {
    let { amount, currency, toCurrency, toNetwork } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        error: "Amount and currency are required",
      });
    }

    currency = String(currency).replace(/"/g, "");

    const paymentService = require("../services/payment/paymentService");
    const { data: profile } = await supabase.from('profiles').select('email').eq('id', req.user.id).single();
    const email = profile?.email || 'user@example.com';

    // BUG FIX: sanitise origin — mobile WebViews send null/"null"/"undefined".
    // Previously used req.headers.origin !== 'undefined' which only caught the
    // literal string 'undefined', not JS-null or the string 'null'.
    const defaultOrigin = process.env.FRONTEND_URL || 'https://notestandard.com';
    const callbackUrl = `${sanitiseOrigin(req.headers.origin, defaultOrigin)}/payment/callback`;

    const result = await paymentService.initializePayment(
      req.user.id,
      email,
      amount,
      currency,
      {
        channel: "card",
        plan: req.userProfile?.plan || "FREE",
        targetCurrency: toCurrency,
        targetNetwork: toNetwork,
        callbackUrl: callbackUrl
      },
      { provider: "paystack" }
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

    const paymentService = require("../services/payment/paymentService");
    const { data: profile } = await supabase.from('profiles').select('email').eq('id', req.user.id).single();
    const email = profile?.email || 'user@example.com';

    // BUG FIX: same origin-sanitisation as depositCard.
    // Previously fell back to `undefined` which Paystack ignores — meaning
    // no redirect after bank transfer completes.
    const defaultOrigin = process.env.FRONTEND_URL || 'https://notestandard.com';
    const callbackUrl = `${sanitiseOrigin(req.headers.origin, defaultOrigin)}/payment/callback`;

    const result = await paymentService.initializePayment(
      req.user.id,
      email,
      amount,
      currency,
      {
        channel: "bank_transfer",
        plan: req.userProfile?.plan || "FREE",
        targetCurrency: toCurrency,
        targetNetwork: toNetwork,
        callbackUrl: callbackUrl
      },
      { provider: "paystack" }
    );

    res.json({
      ...result,
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
    const { reference, proof_url } = req.body;

    if (!reference || !proof_url) {
      return res.status(400).json({ error: "Reference and Proof URL are required" });
    }

    const { data: tx, error: findError } = await supabase
      .from("transactions")
      .select("id, metadata")
      .or(`reference_id.eq.${reference},metadata->>display_ref.eq.${reference}`)
      .single();

    if (findError || !tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        metadata: {
          ...tx.metadata,
          proof_url,
          proof_submitted_at: new Date().toISOString(),
          status_note: "User submitted proof of payment"
        },
        status: "PROCESSING" // Move from PENDING to PROCESSING to signal admin review
      })
      .eq("id", tx.id);

    if (updateError) {
      throw updateError;
    }

    try {
      const { createNotification } = require("../services/notificationService");
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .limit(1)
        .single();

      if (adminProfile?.id) {
        await createNotification({
          receiverId: adminProfile.id,
          type: "deposit_proof_submitted",
          title: "New Deposit Proof",
          message: `User submitted proof for transaction ${reference}`,
          link: `/admin/transactions`
        });
      }
    } catch (nErr) {
      console.warn("Admin notification failed:", nErr.message);
    }

    res.json({ success: true, message: "Proof submitted successfully. Our team will verify it shortly." });
  } catch (err) {
    console.error("[WalletController] Submit Proof Error:", err);
    res.status(500).json({ error: err.message });
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
      result = await CryptoWalletService.withdraw(req.user.id, mappedData);
    } else {
      result = await FiatWalletService.withdraw(req.user.id, mappedData);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    // Proactively verify pending/failed paystack transactions in case webhook was missed.
    // BUG FIX: replaced the previous global singleton monkey-patch
    // (WebhookService.verifySignature = () => true) which was a race condition
    // that could cause double-credits or silent failures under concurrent requests.
    // Now uses safeProactiveCredit() which calls FiatWalletService.fundWallet directly
    // with an idempotency key that prevents any double-credit.
    if (["PENDING", "FAILED"].includes(tx.status) && tx.provider === "paystack") {
      try {
        const PaystackProvider = require("../services/payment/providers/PaystackProvider");
        const provider = new PaystackProvider();
        const verifyResult = await provider.verifyPayment(tx.reference_id);
        
        if (verifyResult.status === "success") {
          await safeProactiveCredit(tx, verifyResult);
          return res.json({ status: "COMPLETED" });
        }
      } catch (pollErr) {
        console.error("[WalletController] Proactive verify failed:", pollErr.message);
      }
    }
    
    res.json({ status: tx.status });
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
    // 1. Fetch referrals where user is the referrer
    const { data: referrals, error } = await supabase
      .from("affiliate_referrals")
      .select(`
        *,
        referred:profiles!referred_user_id(username, email, avatar_url, created_at)
      `)
      .eq("referrer_user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // 2. Get global commission rate
    const { data: commissionRateSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "affiliate_percentage")
      .maybeSingle();

    res.json({
      referrals: referrals || [],
      commissionRate: commissionRateSetting
        ? parseFloat(commissionRateSetting.value)
        : 0.1,
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

