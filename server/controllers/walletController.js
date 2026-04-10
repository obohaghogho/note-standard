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

    res.json(result);
  } catch (error) {
    console.error("[WalletController] Card Deposit Error:", error);
    const isValidationError = error.message.includes("limit") ||
      error.message.includes("Maximum") ||
      error.message.includes("must not exceed");

    if (isValidationError) {
      return res.status(400).json({ error: error.message });
    }

    // DEBUG: Return full error details to identify the 500 cause
    res.status(500).json({
      error: error.message || "Internal Server Error",
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
      details: error.details || error.response?.data || error.message || error,
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

    res.json(result);
  } catch (error) {
    console.error("[WalletController] Bank Transfer Error:", error);
    const isValidationError = error.message.includes("limit") ||
      error.message.includes("Maximum") ||
      error.message.includes("must not exceed");

    if (isValidationError) {
      return res.status(400).json({ error: error.message });
    }

    // DEBUG: Return full error details
    res.status(500).json({
      error: error.message || "Internal Server Error",
      details: error.response?.data || error.details || error,
      location: "walletController.depositTransfer"
    });
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

    const mappedData = {
      type: isCrypto ? "crypto" : "fiat",
      currency,
      amount,
      network: network || "native",
      destination: address || account_number,
      bankId: account_number, 
      bankCode: bank_code,
      bankName: bank_name,
      accountName: account_name,
      country,
      branchCode: branch_code,
      swiftCode: swift_code,
      idempotencyKey
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
    const limit = parseInt(req.query.limit) || 10;
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (err) {
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
