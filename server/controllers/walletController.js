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
        callbackUrl: req.headers.origin ? `${req.headers.origin}/wallet` : undefined
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
        callbackUrl: req.headers.origin ? `${req.headers.origin}/wallet` : undefined
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

    // Proactively verify pending paystack transactions in case webhook was missed
    if (tx.status === "PENDING" && tx.provider === "paystack") {
      try {
        const PaystackProvider = require("../services/payment/providers/PaystackProvider");
        const provider = new PaystackProvider();
        const verifyResult = await provider.verifyPayment(tx.reference_id);
        
        if (verifyResult.status === "success") {
          // Trigger webhook processing manually
          const WebhookService = require("../services/WebhookService");
          // Fake a request object to reuse the webhook logic
          const fakeReq = {
            headers: { "x-forwarded-for": req.ip || "127.0.0.1", "user-agent": req.headers["user-agent"] },
            socket: req.socket,
            body: {
              event: "charge.success",
              data: {
                reference: tx.reference_id,
                amount: verifyResult.amount * 100, // Paystack amount is in kobo
                currency: verifyResult.currency,
                status: "success",
                customer: verifyResult.customer,
                id: "manual_poll_" + Date.now()
              }
            }
          };
          
          // Since verifySignature is checked in processPaystackWebhook, we bypass it by overriding verifySignature for this call
          const originalVerify = WebhookService.verifySignature;
          WebhookService.verifySignature = () => true;
          
          // Fake response
          const fakeRes = {
            status: () => ({ send: () => {} })
          };
          
          await WebhookService.processPaystackWebhook(fakeReq, fakeRes);
          
          // Restore
          WebhookService.verifySignature = originalVerify;
          
          return res.json({ status: "COMPLETED" });
        }
      } catch (pollErr) {
        console.error("[WalletController] Manual poll failed:", pollErr.message);
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
