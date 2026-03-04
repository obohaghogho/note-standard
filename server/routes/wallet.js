const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const { createNotification } = require("../services/notificationService");
const { v4: uuidv4 } = require("uuid");
const commissionService = require("../services/commissionService");
const depositService = require("../services/depositService");
const swapService = require("../services/swapService");
const invoiceService = require("../services/invoiceService");
const nowpaymentsService = require("../services/nowpaymentsService");
const payoutService = require("../services/payment/payoutService"); // NEW: Extracted payout integrations
const { checkUserPlan, checkConsent } = require("../middleware/monetization");
const { transactionLimiter, withdrawalLimiter, hdAddressLimiter } = require(
  "../middleware/rateLimiter",
);

const fxService = require("../services/fxService");

// Middleware to ensure user is authenticated
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token || token === "undefined" || token === "null" || token === "") {
      console.warn(
        `[Wallet Routes] Missing/invalid token on ${req.method} ${req.path}`,
        {
          hasAuthHeader: !!authHeader,
          tokenValue: token ? `${token.substring(0, 10)}...` : "NONE",
        },
      );
      return res.status(401).json({
        error: "Unauthorized - No valid token provided",
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error(
        `[Wallet Routes] Auth error on ${req.method} ${req.path}:`,
        error.message,
      );
      return res.status(401).json({
        error: "Unauthorized - Token validation failed",
      });
    }

    if (!user) {
      console.warn(
        `[Wallet Routes] No user found for token on ${req.method} ${req.path}`,
      );
      return res.status(401).json({ error: "Unauthorized - User not found" });
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
  const { currency, network = "native" } = req.body;
  if (!currency) return res.status(400).json({ error: "Currency is required" });

  try {
    const { data: existing } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", req.user.id)
      .eq("currency", currency)
      .eq("network", network)
      .maybeSingle();

    if (existing) return res.json(existing);

    const { data: wallet, error } = await supabase
      .from("wallets")
      .insert({
        user_id: req.user.id,
        currency: currency,
        network: network,
        balance: 0,
        address: uuidv4(), // Fallback; normally generated on-demand by provider
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

// POST /generate-new-address
// Compliance: address is issued by NOWPayments (not derived from our keys)
router.post(
  "/generate-new-address",
  hdAddressLimiter,
  async (req, res) => {
    const { asset, network } = req.body;
    if (!asset) return res.status(400).json({ error: "Asset is required" });

    try {
      const upAsset = asset.toUpperCase().trim();
      const upNetwork = (network || "").toUpperCase().trim();

      // Mark any existing active address as superseded so a fresh one is created
      await supabase
        .from("nowpayments_deposit_addresses")
        .update({ status: "superseded" })
        .eq("user_id", req.user.id)
        .eq("asset", upAsset)
        .eq("status", "active");

      const result = await nowpaymentsService.getOrCreateDepositAddress(
        req.user.id,
        upAsset,
        upNetwork,
        supabase,
      );
      res.json({
        address: result.address,
        currency: result.currency,
        network: result.network,
        payment_id: result.payment_id,
      });
    } catch (err) {
      console.error(
        "[Wallet] Error generating NOWPayments deposit address:",
        err.message,
      );
      res.status(500).json({
        error: err.message || "Failed to generate new deposit address",
      });
    }
  },
);

// GET /current-address
// Compliance: address is fetched from NOWPayments (not derived from our keys)
router.get("/current-address", async (req, res) => {
  const { asset, network } = req.query;
  if (!asset) return res.status(400).json({ error: "Asset is required" });

  try {
    const upAsset = asset.toUpperCase().trim();
    const upNetwork = (network || "").toUpperCase().trim();

    const result = await nowpaymentsService.getOrCreateDepositAddress(
      req.user.id,
      upAsset,
      upNetwork,
      supabase,
    );
    res.json({
      address: result.address,
      currency: result.currency,
      network: result.network,
      payment_id: result.payment_id,
    });
  } catch (err) {
    console.error(
      "[Wallet] Error fetching NOWPayments deposit address:",
      err.message,
    );
    res.status(500).json({
      error: err.message || "Failed to fetch current address",
    });
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    // Fetch transactions with pagination
    const { data: txs, error: txError, count: totalCount } = await supabase
      .from("transactions")
      .select(`*, wallet:wallets(currency)`, { count: "exact" })
      .in("wallet_id", walletIds)
      .order("created_at", { ascending: false })
      .range(start, end);

    if (txError) throw txError;

    return res.json({
      transactions: txs || [],
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        hasMore: (totalCount || 0) > (page * limit),
      },
    });
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
      recipientAddress,
      idempotencyKey,
      network = "native",
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
        ).eq("address", recipientAddress).eq("currency", currency).eq(
          "network",
          network,
        ).single();
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
      ).eq("user_id", req.user.id).eq("currency", currency).eq(
        "network",
        network,
      ).single();
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
      ).eq("user_id", targetUserId).eq("currency", currency).eq(
        "network",
        network,
      ).single();
      if (!recipientWallet) {
        const { data: newWallet } = await supabase.from("wallets").insert({
          user_id: targetUserId,
          currency,
          network,
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
  const {
    amount,
    currency,
    bankId,
    idempotencyKey,
    twoFactorCode,
    cryptoAddress,
    network = "native",
  } = req.body;
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
    ).eq("user_id", req.user.id).eq("currency", currency).eq("network", network)
      .single();

    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    // Ensure they have enough to cover amount + fee
    if (wallet.balance < (withdrawAmount + commission.fee)) {
      return res.status(400).json({
        error: "Insufficient balance to cover amount and withdrawal fee",
      });
    }

    // Mock 2FA verification: If user sends a code, assume it's verified for now
    const is2FAVerified = !!twoFactorCode;

    // Check if it's a crypto or fiat withdrawal
    const isCrypto = ["BTC", "ETH", "USDT", "USDC", "MATIC"].some((c) =>
      currency.toUpperCase().startsWith(c)
    );

    // Generate internal reference BEFORE calling external provider
    const internalReference = req.body.reference ||
      `wdr_${Date.now()}_${req.user.id.substring(0, 8)}`;

    let payoutResult;
    try {
      if (isCrypto) {
        if (!cryptoAddress) {
          return res.status(400).json({
            error: "Missing crypto destination address",
          });
        }

        payoutResult = await payoutService.createNowPaymentsPayout(
          cryptoAddress,
          withdrawAmount,
          currency,
          internalReference,
          network,
        );
      } else {
        if (!bankId) {
          return res.status(400).json({
            error: "Missing destination bank/account info",
          });
        }

        // Assuming bankId contains necessary account info for MVP.
        // In a real scenario, you'd fetch the saved user bank account details using bankId.
        // For this structural refactor, we assume bankId is the account number and use a default bank code
        const defaultBankCode = "044"; // Access Bank example
        payoutResult = await payoutService.createFlutterwaveTransfer(
          defaultBankCode,
          bankId, // Treating bankId as account number for now
          withdrawAmount,
          currency,
          internalReference,
          `Withdrawal for ${req.user.id}`,
        );
      }
    } catch (providerError) {
      return res.status(502).json({
        error: providerError.message ||
          "Failed to initiate transfer with payout provider",
      });
    }

    // Only if provider successfully initiated the payout do we deduct the internal ledger
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
          cryptoAddress: isCrypto ? cryptoAddress : null,
          bankId: !isCrypto ? bankId : null,
          transaction_fee_breakdown: { withdrawal_fee: commission.fee },
          provider_response: payoutResult, // Store provider response mapping
        },
      },
    );

    if (txError) {
      // DANGER: We initiated a payout externally but DB update failed!
      // Real-world: Alert admin immediately to cancel external transfer or manually reconcile
      console.error(
        `[CRITICAL] External transfer initiated (${payoutResult.payoutId}) but DB ledger deduction failed!`,
        txError,
      );

      if (txError.message === "2FA_REQUIRED") {
        return res.status(403).json({
          error: "2FA Verification Required",
          code: "2FA_REQUIRED",
        });
      }
      throw txError;
    }

    // UPDATE the newly created transaction with the external tracking info
    await supabase.from("transactions").update({
      reference_id: internalReference,
      external_payout_id: String(payoutResult.payoutId),
      external_payout_status: payoutResult.status,
      provider: payoutResult.provider,
      status: "PROCESSING",
    }).eq("id", txId);

    res.json({
      success: true,
      transactionId: txId,
      fee: commission.fee,
      netAmount: withdrawAmount,
      status: "processing",
      providerStatus: payoutResult.status,
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
  const {
    fromCurrency,
    toCurrency,
    amount,
    slippageTolerance,
    fromNetwork,
    toNetwork,
  } = req.body;
  try {
    const preview = await swapService.calculateSwapPreview(
      req.user.id,
      fromCurrency,
      toCurrency,
      parseFloat(amount),
      req.user.plan,
      slippageTolerance ? parseFloat(slippageTolerance) : 0.005,
      fromNetwork || "native",
      toNetwork || "native",
    );
    res.json(preview);
  } catch (err) {
    console.error("[Swap Preview Error]", err);
    res.status(400).json({
      error: err.message || "Failed to calculate swap",
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

router.post(
  "/swap/execute",
  transactionLimiter,
  checkConsent,
  async (req, res) => {
    const {
      fromCurrency,
      toCurrency,
      amount,
      idempotencyKey,
      lockId,
      slippageTolerance,
      fromNetwork,
      toNetwork,
    } = req.body;
    console.log("[Swap Execute] Request:", {
      fromCurrency,
      toCurrency,
      amount,
      idempotencyKey,
      lockId,
      slippageTolerance,
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
        slippageTolerance ? parseFloat(slippageTolerance) : 0.005,
        fromNetwork || "native",
        toNetwork || "native",
      );
      res.json(result);
    } catch (err) {
      console.error("[Swap Execute Error]", err.message);

      const isUserError = err.message.includes("INSUFFICIENT") ||
        err.message.includes("SLIPPAGE") ||
        err.message.includes("MAX_SWAP") ||
        err.message.includes("expired") ||
        err.message.includes("match");

      res.status(isUserError ? 400 : 500).json({
        error: err.message || "Swap failed",
      });
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
