/**
 * Anchor BaaS Dedicated Routes
 * Endpoint prefix: /api/anchor/*
 */

const express = require("express");
const router = express.Router();
const anchorService = require("../services/anchorService");
const { requireAuth } = require("../middleware/authMiddleware");
const supabase = require("../config/database");
const logger = require("../utils/logger");

// ─── Feature Flag Guard Middleware ────────────────────────────
router.use((req, res, next) => {
  if (process.env.ANCHOR_ENABLED !== "true") {
    return res.status(404).json({
      success: false,
      message: "Anchor integration disabled",
      timestamp: new Date().toISOString(),
    });
  }
  next();
});

/**
 * GET /api/anchor/health
 * Returns provider health, authentication status, latency, and environment mode
 */
router.get("/health", async (req, res, next) => {
  try {
    const health = await anchorService.getHealthStatus();
    res.json({ success: true, health });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/anchor/banks
 * Returns list of NIP supported banks
 */
router.get("/banks", async (req, res, next) => {
  try {
    const banks = await anchorService.getBankList();
    res.json({ success: true, count: banks.length, banks });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/anchor/verify-account
 * Resolves account number to account holder name via Anchor NIP lookup
 */
router.post("/verify-account", requireAuth, async (req, res, next) => {
  const { accountNumber, bankCode } = req.body;

  if (!accountNumber || !bankCode) {
    return res.status(400).json({
      success: false,
      error: "accountNumber and bankCode are required",
    });
  }

  try {
    const result = await anchorService.resolveAccountName(accountNumber, bankCode);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/anchor/virtual-account
 * Generates an Anchor virtual account for authenticated user
 */
router.post("/virtual-account", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;
    const { firstName, lastName, phone, bvn } = req.body;

    const result = await anchorService.createVirtualAccount({
      userId,
      email,
      firstName: firstName || req.user.user_metadata?.first_name,
      lastName: lastName || req.user.user_metadata?.last_name,
      phone: phone || req.user.phone,
      bvn,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/anchor/accounts
 * Fetches user's Anchor dedicated virtual accounts
 */
router.get("/accounts", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: accounts, error } = await supabase
      .from("dedicated_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "anchor");

    if (error) throw error;

    res.json({ success: true, accounts: accounts || [] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/anchor/transfer
 * Initiates payout transfer via Anchor (passes through NoteStandard payoutService)
 */
router.post("/transfer", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { amount, currency = "NGN", accountNumber, bankCode, accountName, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Valid transfer amount is required" });
    }

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ success: false, error: "Destination accountNumber and bankCode are required" });
    }

    const payoutService = require("../services/payment/payoutService");

    const result = await payoutService.initiatePayout({
      userId,
      amount,
      currency,
      provider: "anchor",
      destination: {
        accountNumber,
        bankCode,
        accountName,
      },
      reason,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
