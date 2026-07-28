/**
 * Versioned REST API Route — Enterprise Payout Infrastructure (/api/v1/withdrawals/*)
 * ──────────────────────────────────────────────────────────────────────────────────
 */

const express          = require("express");
const rateLimit        = require("express-rate-limit");
const router           = express.Router();
const { requireAuth }  = require("../../middleware/authMiddleware");
const payoutEngine     = require("../../withdrawal/payoutEngine");
const verification     = require("../../services/fincra/verification");
const { registry }     = require("../../providers/PayoutProvider");
const logger           = require("../../utils/logger");

const withdrawalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: "Too many withdrawal requests. Please wait a moment." },
});

// ── GET /api/v1/withdrawals/health ──────────────────────────────────────────
router.get("/health", async (req, res) => {
  try {
    const healthMonitor = require("../../withdrawal/healthMonitor");
    const health = await healthMonitor.checkFullStackHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({
      status: "DEGRADED",
      canWithdraw: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ── POST /api/v1/withdrawals/verify-account ────────────────────────────────
router.post("/verify-account", requireAuth, withdrawalLimiter, async (req, res, next) => {
  try {
    const { accountNumber, bankCode, currency = "NGN" } = req.body;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ success: false, error: "accountNumber and bankCode are required." });
    }

    const provider = registry.getPrimary();
    const result = await provider.resolveAccount({ accountNumber, bankCode, currency, userId: req.user.id });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/withdrawals ────────────────────────────────────────────────
router.post("/", requireAuth, withdrawalLimiter, async (req, res, next) => {
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

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/withdrawals/verify-otp ────────────────────────────────────
router.post("/verify-otp", requireAuth, withdrawalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const correlationId = req.headers["x-correlation-id"] || req.headers["x-request-id"];
    const { otp, withdrawal_reference, fincra_reference, trace_id } = req.body;

    if (!otp || (!withdrawal_reference && !fincra_reference)) {
      return res.status(400).json({
        success: false,
        error: "otp and withdrawal_reference (or fincra_reference) are required.",
      });
    }

    const result = await payoutEngine.verifyOtp({
      userId,
      withdrawalReference: withdrawal_reference,
      fincraReference: fincra_reference,
      otp,
      traceId: trace_id,
      correlationId,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || "OTP verification failed.",
    });
  }
});

// ── POST /api/v1/withdrawals/resend-otp ────────────────────────────────────
router.post("/resend-otp", requireAuth, withdrawalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { withdrawal_reference, fincra_reference } = req.body;

    if (!withdrawal_reference && !fincra_reference) {
      return res.status(400).json({
        success: false,
        error: "withdrawal_reference or fincra_reference is required.",
      });
    }

    const result = await payoutEngine.resendOtp({
      userId,
      withdrawalReference: withdrawal_reference,
      fincraReference: fincra_reference,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || "Failed to resend OTP.",
    });
  }
});

// ── GET /api/v1/withdrawals/:id/verify ──────────────────────────────────────
router.get("/:id/verify", async (req, res, next) => {
  try {
    const { verifyReceipt } = require("../../withdrawal/receiptService");
    const result = await verifyReceipt(req.params.id);
    if (!result.valid) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
