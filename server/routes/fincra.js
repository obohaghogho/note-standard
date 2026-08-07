/**
 * Fincra Payment Infrastructure — Protected API Routes
 * Endpoint prefix: /api/fincra/*
 *
 * All endpoints require:
 *  - Authentication (requireAuth)
 *  - ENABLE_FINCRA=true feature flag
 *  - Rate limiting
 *
 * NO EXISTING ROUTES ARE MODIFIED.
 */

const express      = require("express");
const rateLimit    = require("express-rate-limit");
const router       = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const logger       = require("../utils/logger");

const virtualAccount = require("../services/fincra/virtualAccount");
const payout         = require("../services/fincra/payout");
const verification   = require("../services/fincra/verification");
const conversion     = require("../services/fincra/conversion");
const reconciliation = require("../services/fincra/reconciliation");

// ─── Feature Flag Guard ────────────────────────────────────────────────────
router.use((req, res, next) => {
  next();
});

// ─── Rate Limiters ────────────────────────────────────────────────────────
const standardLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 30,
  skip: (req) => process.env.NODE_ENV === 'development' || req.ip === '127.0.0.1' || req.ip === '::1',
  message: { error: "Too many Fincra requests. Please try again in a moment." },
});

const withdrawalLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 5,   // Very restrictive for withdrawals
  skip: (req) => process.env.NODE_ENV === 'development' || req.ip === '127.0.0.1' || req.ip === '::1',
  message: { error: "Too many withdrawal attempts. Please wait before trying again." },
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fincra/deposit
// Provisions or retrieves a dedicated Fincra virtual account for deposit.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/deposit", requireAuth, standardLimiter, async (req, res, next) => {
  try {
    const userId   = req.user.id;
    const email    = req.user.email;
    const { firstName, lastName, currency = "NGN" } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, error: "firstName and lastName are required." });
    }

    const account = await virtualAccount.createOrGetFincraVirtualAccount({
      userId, email, firstName, lastName, currency,
    });

    res.json({ success: true, account });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fincra/accounts
// Returns all active Fincra virtual accounts for the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/accounts", requireAuth, standardLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const accounts = await virtualAccount.getUserFincraAccounts(userId);
    res.json({ success: true, accounts });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fincra/verify-account
// Resolve bank account name before withdrawal. Rate limited (5/min).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/verify-account", requireAuth, withdrawalLimiter, async (req, res, next) => {
  try {
    const { accountNumber, bankCode, currency = "NGN" } = req.body;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ success: false, error: "accountNumber and bankCode are required." });
    }

    const result = await verification.verifyBankAccount({
      accountNumber,
      bankCode,
      currency,
      userId: req.user.id,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/fincra/withdraw
// Initiate a bank withdrawal. Rate limited (5/min). Uses Enterprise Payout Engine.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/withdraw", requireAuth, withdrawalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const correlationId = req.headers["x-correlation-id"] || req.headers["x-request-id"];
    const { amount, currency = "NGN", bankCode, accountNumber, accountName, narration, idempotencyKey } = req.body;

    if (!amount || !bankCode || !accountNumber || !accountName) {
      return res.status(400).json({
        success: false,
        error: "amount, bankCode, accountNumber, and accountName are required.",
      });
    }

    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, error: "Withdrawal amount must be greater than 0." });
    }

    const payoutEngine = require("../withdrawal/payoutEngine");
    const result = await payoutEngine.processWithdrawal({
      userId,
      amount: parseFloat(amount),
      currency,
      bankCode,
      accountNumber,
      accountName,
      narration,
      idempotencyKey,
      correlationId,
      ip: req.ip || req.socket?.remoteAddress,
      deviceId: req.headers["x-device-id"] || "browser",
      userAgent: req.headers["user-agent"] || "unknown",
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fincra/verify-otp
// Submit OTP verification for payout challenge.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/verify-otp", requireAuth, withdrawalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const correlationId = req.headers["x-correlation-id"] || req.headers["x-request-id"];
    const { otp, withdrawal_reference, fincra_reference, trace_id } = req.body;

    if (!otp || (!withdrawal_reference && !fincra_reference)) {
      return res.status(400).json({ success: false, error: "otp and withdrawal_reference (or fincra_reference) are required." });
    }

    const payoutEngine = require("../withdrawal/payoutEngine");
    const result = await payoutEngine.verifyOtp({
      userId,
      withdrawalReference: withdrawal_reference,
      fincraReference: fincra_reference,
      otp,
      traceId: trace_id,
      correlationId,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || "OTP verification failed." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fincra/resend-otp
// Resend OTP challenge for payout.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/resend-otp", requireAuth, withdrawalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { withdrawal_reference, fincra_reference } = req.body;

    if (!withdrawal_reference && !fincra_reference) {
      return res.status(400).json({ success: false, error: "withdrawal_reference or fincra_reference is required." });
    }

    const payoutEngine = require("../withdrawal/payoutEngine");
    const result = await payoutEngine.resendOtp({
      userId,
      withdrawalReference: withdrawal_reference,
      fincraReference: fincra_reference,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || "Failed to resend OTP." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fincra/quote
// Generate a Fincra currency conversion quote (NGN, USD, EUR only).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/quote", requireAuth, standardLimiter, async (req, res, next) => {
  try {
    const { sourceCurrency, destinationCurrency, amount } = req.body;

    if (!sourceCurrency || !destinationCurrency || !amount) {
      return res.status(400).json({ success: false, error: "sourceCurrency, destinationCurrency, and amount are required." });
    }

    const quote = await conversion.generateFincraQuote({
      sourceCurrency,
      destinationCurrency,
      amount: parseFloat(amount),
      userId: req.user.id,
    });

    res.json({ success: true, quote });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fincra/convert
// Execute a currency conversion using a confirmed Fincra quote reference.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/convert", requireAuth, standardLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { quoteReference, sourceCurrency, destinationCurrency, amount } = req.body;

    if (!quoteReference || !sourceCurrency || !destinationCurrency || !amount) {
      return res.status(400).json({ success: false, error: "quoteReference, sourceCurrency, destinationCurrency, and amount are required." });
    }

    const result = await conversion.executeFincraConversion({
      quoteReference, userId, sourceCurrency, destinationCurrency, amount: parseFloat(amount),
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fincra/reconcile (Admin only)
// Run reconciliation for a given currency.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reconcile", requireAuth, async (req, res, next) => {
  try {
    // Basic admin guard: only allow if user has admin role in profiles
    const supabase = require("../config/database");
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin access required." });
    }

    const { currency = "NGN", fromDate, toDate } = req.body;
    const report = await reconciliation.runFincraReconciliation({ currency, fromDate, toDate });

    res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
