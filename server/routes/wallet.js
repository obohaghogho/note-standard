const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const { createNotification } = require("../services/notificationService");
const { v4: uuidv4 } = require("uuid");
const commissionService = require("../services/commissionService");
const depositService = require("../services/depositService");
const swapService = require("../services/swapService");
const invoiceService = require("../services/invoiceService");
const { checkUserPlan, checkConsent } = require("../middleware/monetization");
const { transactionLimiter, withdrawalLimiter } = require(
  "../middleware/rateLimiter",
);

const fxService = require("../services/fxService");

// Middleware to ensure user is authenticated
const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      console.warn("[Wallet Routes] Missing token");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("[Wallet Routes] Auth error:", error.message);
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!user) {
      console.warn("[Wallet Routes] No user found for token");
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("[Wallet Routes] requireAuth unexpected error:", err.message);
    if (err.cause) console.error("[Wallet Routes] Error cause:", err.cause);
    res.status(500).json({ error: "Server error" });
  }
};

router.use(requireAuth);
router.use(checkUserPlan); // Attach plan to req.user

// GET /exchange-rates
router.get("/exchange-rates", async (req, res) => {
  try {
    const rates = await fxService.getAllRates("USD");
    res.json(rates);
  } catch (err) {
    console.error("Error fetching exchange rates:", err);
    res.status(500).json({ error: "Failed to fetch exchange rates" });
  }
});

// GET / - Get all wallets with balances
router.get("/", async (req, res) => {
  try {
    const { data: wallets, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", req.user.id);

    if (error) throw error;
    res.json(wallets || []);
  } catch (err) {
    console.error("Error fetching wallets:", err);
    res.status(500).json({ error: "Failed to fetch wallets" });
  }
});

// GET /commission-rate
router.get("/commission-rate", async (req, res) => {
  const { type, currency } = req.query;
  try {
    const rate = await commissionService.calculateCommission(
      type || "TRANSFER_OUT",
      1,
      currency || "BTC",
      req.user.plan,
    );
    res.json({ ...rate, userPlan: req.user.plan });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rates" });
  }
});

// POST /create
router.post("/create", async (req, res) => {
  const { currency } = req.body;
  if (!currency) return res.status(400).json({ error: "Currency is required" });

  try {
    const { data: existing } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", req.user.id)
      .eq("currency", currency)
      .single();

    if (existing) return res.json(existing);

    const { data: wallet, error } = await supabase
      .from("wallets")
      .insert({
        user_id: req.user.id,
        currency: currency,
        balance: 0,
        address: uuidv4(),
      })
      .select()
      .single();

    if (error) throw error;
    res.json(wallet);
  } catch (err) {
    console.error("Error creating wallet:", err);
    res.status(500).json({ error: "Failed to create wallet" });
  }
});

// GET /transactions
router.get("/transactions", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized", transactions: [] });
    }

    const { data: wallets, error: walletError } = await supabase
      .from("wallets")
      .select("id, currency")
      .eq("user_id", userId);

    if (walletError || !wallets || wallets.length === 0) {
      return res.json({ transactions: [] });
    }

    const walletIds = wallets.map((w) => w.id);

    const { data: txs, error: txError } = await supabase
      .from("transactions")
      .select(`*, wallet:wallets(currency)`)
      .in("wallet_id", walletIds)
      .order("created_at", { ascending: false })
      .limit(100);

    return res.json({ transactions: txs || [] });
  } catch (err) {
    return res.json({
      transactions: [],
      error: "An unexpected error occurred",
    });
  }
});

// GET /transactions/:id/invoice
router.get("/transactions/:id/invoice", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: tx, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Security check: must own the wallet
    const { data: wallet } = await supabase
      .from("wallets")
      .select("user_id")
      .eq("id", tx.wallet_id)
      .single();

    if (wallet?.user_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, username, email")
      .eq("id", req.user.id)
      .single();

    const pdfBuffer = await invoiceService.generateInvoice(tx, profile);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice_${id.substring(0, 8)}.pdf`,
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Invoice generation error:", err);
    res.status(500).json({ error: "Failed to generate invoice" });
  }
});

// POST /transfer/internal
router.post(
  "/transfer/internal",
  transactionLimiter,
  checkConsent,
  async (req, res) => {
    const {
      recipientEmail,
      amount,
      currency,
      recipientId,
      recipientAddress,
      idempotencyKey,
    } = req.body;

    if (
      (!recipientEmail && !recipientId && !recipientAddress) || !amount ||
      !currency
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const transferAmount = parseFloat(amount);
      let targetUserId = recipientId;
      let isExternal = false;

      if (!targetUserId && recipientAddress) {
        const { data: targetWallet } = await supabase.from("wallets").select(
          "user_id",
        ).eq("address", recipientAddress).eq("currency", currency).single();
        if (targetWallet) targetUserId = targetWallet.user_id;
        else if (
          (currency === "BTC" &&
            /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(recipientAddress)) ||
          (currency === "ETH" && /^0x[a-fA-F0-9]{40}$/.test(recipientAddress))
        ) {
          isExternal = true;
        } else {
          return res.status(404).json({
            error: "Recipient not found and address format invalid",
          });
        }
      }

      if (!targetUserId && !isExternal && recipientEmail) {
        const { data: profile } = await supabase.from("profiles").select("id")
          .eq("email", recipientEmail).single();
        if (profile) targetUserId = profile.id;
      }

      if (!targetUserId && !isExternal) {
        return res.status(400).json({
          error: "Could not resolve recipient",
        });
      }

      const commission = await commissionService.calculateCommission(
        isExternal ? "WITHDRAWAL" : "TRANSFER_OUT",
        transferAmount,
        currency,
        req.user.plan,
      );
      const platformWalletId = await commissionService.getPlatformWalletId(
        currency,
      );

      const { data: senderWallet } = await supabase.from("wallets").select(
        "id, balance",
      ).eq("user_id", req.user.id).eq("currency", currency).single();
      if (!senderWallet) {
        return res.status(404).json({
          error: "Sender wallet not found",
        });
      }

      if (
        parseFloat(senderWallet.balance) < (transferAmount + commission.fee)
      ) {
        return res.status(400).json({
          error: `Insufficient funds. Need ${
            transferAmount + commission.fee
          } ${currency}`,
        });
      }

      if (isExternal) {
        const { data: txId, error: txError } = await supabase.rpc(
          "withdraw_funds",
          {
            p_wallet_id: senderWallet.id,
            p_amount: transferAmount,
            p_currency: currency,
            p_fee: commission.fee,
            p_rate: commission.rate,
            p_platform_wallet_id: platformWalletId,
            p_idempotency_key: idempotencyKey,
            p_metadata: {
              externalAddress: recipientAddress,
              source: "transfer_unified",
              transaction_fee_breakdown: { withdrawal_fee: commission.fee },
            },
          },
        );
        if (txError) throw txError;

        return res.json({
          success: true,
          transactionId: txId,
          fee: commission.fee,
        });
      }

      // Internal transfer logic...
      let { data: recipientWallet } = await supabase.from("wallets").select(
        "id",
      ).eq("user_id", targetUserId).eq("currency", currency).single();
      if (!recipientWallet) {
        const { data: newWallet } = await supabase.from("wallets").insert({
          user_id: targetUserId,
          currency,
          balance: 0,
          address: uuidv4(),
        }).select().single();
        recipientWallet = newWallet;
      }

      const { data: txId, error: txError } = await supabase.rpc(
        "transfer_funds",
        {
          p_sender_wallet_id: senderWallet.id,
          p_receiver_wallet_id: recipientWallet.id,
          p_amount: transferAmount,
          p_currency: currency,
          p_fee: commission.fee,
          p_rate: commission.rate,
          p_platform_wallet_id: platformWalletId,
          p_idempotency_key: idempotencyKey,
          p_metadata: {
            transaction_fee_breakdown: { transfer_fee: commission.fee },
          },
        },
      );
      if (txError) throw txError;

      // 4. Trigger Notification for Recipient
      try {
        const io = req.app.get("io");
        const { data: sender } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", req.user.id)
          .single();

        await createNotification({
          receiverId: targetUserId,
          senderId: req.user.id,
          type: "transfer_receive",
          title: "Funds Received",
          message: `You received ${transferAmount} ${currency} from ${
            sender?.username || "a user"
          }.`,
          link: `/dashboard/wallet`,
          io,
        });
      } catch (notifErr) {
        console.error(
          "[Wallet] Failed to send transfer notification:",
          notifErr.message,
        );
      }

      res.json({ success: true, transactionId: txId, fee: commission.fee });
    } catch (err) {
      res.status(500).json({ error: err.message || "Transfer failed" });
    }
  },
);

// POST /withdraw
router.post("/withdraw", withdrawalLimiter, checkConsent, async (req, res) => {
  const { amount, currency, bankId, idempotencyKey, twoFactorCode } = req.body;
  if (!amount || !currency) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const withdrawAmount = parseFloat(amount);
    const commission = await commissionService.calculateCommission(
      "WITHDRAWAL",
      withdrawAmount,
      currency,
      req.user.plan,
    );
    const platformWalletId = await commissionService.getPlatformWalletId(
      currency,
    );

    const { data: wallet } = await supabase.from("wallets").select(
      "id, balance",
    ).eq("user_id", req.user.id).eq("currency", currency).single();
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    // Mock 2FA verification: If user sends a code, assume it's verified for now
    const is2FAVerified = !!twoFactorCode;

    const { data: txId, error: txError } = await supabase.rpc(
      "withdraw_funds_secured",
      {
        p_wallet_id: wallet.id,
        p_amount: withdrawAmount,
        p_currency: currency,
        p_fee: commission.fee,
        p_rate: commission.rate,
        p_platform_wallet_id: platformWalletId,
        p_idempotency_key: idempotencyKey,
        p_2fa_verified: is2FAVerified,
        p_metadata: {
          bankId,
          transaction_fee_breakdown: { withdrawal_fee: commission.fee },
        },
      },
    );

    if (txError) {
      if (txError.message === "2FA_REQUIRED") {
        return res.status(403).json({
          error: "2FA Verification Required",
          code: "2FA_REQUIRED",
        });
      }
      throw txError;
    }

    res.json({
      success: true,
      transactionId: txId,
      fee: commission.fee,
      netAmount: withdrawAmount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Withdrawal failed" });
  }
});

// DEPOSIT ENDPOINTS
router.post("/deposit/card", checkConsent, async (req, res) => {
  const { currency, amount, idempotencyKey } = req.body;
  try {
    const result = await depositService.createCardDeposit(
      req.user.id,
      currency,
      parseFloat(amount),
      req.user.plan,
      idempotencyKey,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to create deposit" });
  }
});

router.post("/deposit/bank", checkConsent, async (req, res) => {
  const { currency, amount, idempotencyKey } = req.body;
  try {
    const result = await depositService.createBankDeposit(
      req.user.id,
      currency,
      parseFloat(amount),
      req.user.plan,
      idempotencyKey,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to create deposit" });
  }
});

// SWAP ENDPOINTS
router.post("/swap/preview", async (req, res) => {
  const { fromCurrency, toCurrency, amount } = req.body;
  try {
    const preview = await swapService.calculateSwapPreview(
      fromCurrency,
      toCurrency,
      parseFloat(amount),
      req.user.plan,
    );
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: "Failed to calculate swap" });
  }
});

router.post(
  "/swap/execute",
  transactionLimiter,
  checkConsent,
  async (req, res) => {
    const { fromCurrency, toCurrency, amount, idempotencyKey, lockId } =
      req.body;
    console.log("[Swap Execute] Request:", {
      fromCurrency,
      toCurrency,
      amount,
      idempotencyKey,
      lockId,
      userId: req.user?.id,
      plan: req.user?.plan,
    });
    try {
      const result = await swapService.executeSwap(
        req.user.id,
        fromCurrency,
        toCurrency,
        parseFloat(amount),
        idempotencyKey,
        req.user.plan,
        lockId,
      );
      res.json(result);
    } catch (err) {
      console.error("[Swap Execute Error]", err.message);
      console.error("[Swap Execute Stack]", err.stack);
      res.status(500).json({ error: err.message || "Swap failed" });
    }
  },
);

// GET /affiliates/my-stats
router.get("/affiliates/my-stats", async (req, res) => {
  try {
    const { data: referrals, error } = await supabase
      .from("affiliate_referrals")
      .select(`
        *,
        referred:profiles!referred_user_id(username, email, created_at)
      `)
      .eq("referrer_user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Get commission rate from setting
    const commissionRate =
      await commissionService.getSetting("affiliate_percentage") ||
      10;

    res.json({
      referrals: referrals || [],
      commissionRate: parseFloat(commissionRate),
    });
  } catch (err) {
    console.error("Error fetching my affiliate stats:", err);
    res.status(500).json({ error: "Failed to fetch affiliate stats" });
  }
});

module.exports = router;
