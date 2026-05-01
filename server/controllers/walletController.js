const walletService = require("../services/walletService");
const supabase = require("../config/database");

/**
 * Wallet Controller
 * Handles user wallet operations.
 */
exports.getBalances = async (req, res, next) => {
  try {
    const wallets = await walletService.getWallets(req.user.id);
    res.json(wallets);
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

    const depositService = require("../services/depositService");
    const result = await depositService.initializeCryptoDeposit(
      req.user.id,
      currency,
      amount,
      req.userProfile?.plan || "FREE"
    );
    res.json(result);
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

    const result = await require("../services/depositService")
      .createCardDeposit(
        req.user.id,
        currency,
        amount,
        req.userProfile?.plan || "FREE",
        null,
        { toCurrency, toNetwork }
      );

    // Prune result to prevent circular reference crashes on Windows
    const cleanData = {
      link: result?.link || result?.data?.link,
      reference: result?.reference || result?.data?.reference,
      status: result?.status || result?.data?.status
    };

    res.json({
      success: true,
      data: cleanData
    });
  } catch (error) {
    console.error("[WalletController] Card Deposit Error:", error);
    const isValidationError = error.message.includes("limit") ||
      error.message.includes("Maximum") ||
      error.message.includes("must not exceed") ||
      error.message.includes("unavailable") ||
      error.message.includes("not supported");

    if (isValidationError) {
      return res.status(400).json({ error: error.message });
    }

    // DEBUG: Return full error details to identify the 500 cause
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

    const result = await require("../services/depositService")
      .createBankDeposit(
        req.user.id,
        currency,
        amount,
        req.userProfile?.plan || "FREE",
        null,
        { toCurrency, toNetwork }
      );

    // Prune result to prevent circular reference crashes on Windows
    const cleanData = {
      link: result?.link || result?.data?.link,
      reference: result?.reference || result?.data?.reference,
      status: result?.status || result?.data?.status,
      account_number: result?.account_number || result?.data?.account_number,
      bank_name: result?.bank_name || result?.data?.bank_name
    };

    res.json({
      success: true,
      data: cleanData
    });
  } catch (error) {
    console.error("[WalletController] Bank Transfer Error:", error);
    const isValidationError = error.message.includes("limit") ||
      error.message.includes("Maximum") ||
      error.message.includes("must not exceed") ||
      error.message.includes("unavailable") ||
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

    // Notify Admin (Implementation depends on your notification system)
    try {
      const { createNotification } = require("../services/notificationService");
      // Find an admin user or use a system channel
      await createNotification({
        receiverId: "SYSTEM_ADMIN", // Placeholder or actual admin ID
        type: "deposit_proof_submitted",
        title: "New Deposit Proof",
        message: `User submitted proof for transaction ${reference}`,
        link: `/admin/transactions`
      });
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
      country,
      network,
      idempotencyKey,
    } = req.body;

    const isCrypto = ["BTC", "ETH", "USDT", "USDC", "TRX", "POLYGON"].includes(String(currency).toUpperCase());

    // Build a structured destination object so payoutWorker can extract
    // bankCode, accountNumber, accountName etc. correctly when dispatching to Fincra.
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
        };

    const mappedData = {
      // 'method' is what payoutService.createPayoutRequest reads for payout_method.
      // 'type' is kept for backward-compat in walletService.
      method: isCrypto ? "crypto" : "bank_transfer",
      type:   isCrypto ? "crypto" : "fiat",
      currency,
      amount,
      network: network || "native",
      destination,
      client_idempotency_key: idempotencyKey,
    };

    const result = await walletService.withdraw(req.user.id, mappedData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.transfer = async (req, res) => {
  try {
    const result = await walletService.transferInternal(
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
    const wallet = await walletService.createWallet(
      req.user.id,
      currency,
      network,
    );
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
    
    const result = await walletService.getAddress(
      req.user.id,
      currency,
      network || "native",
      isPost // forceNew if it's a POST request
    );
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
    const status = await require("../services/depositService").getDepositStatus(
      reference,
    );
    if (!status) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    res.json(status);
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
