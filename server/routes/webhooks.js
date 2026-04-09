/**
 * Webhook Routes
 *
 * Central routing for all payment provider webhooks.
 * Each endpoint follows stability rules:
 * - Always returns 200 OK (to prevent provider retries)
 * - Logs every request for audit trail
 * - Processes asynchronously via queue
 */

const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/payment/webhookController");
const depositService = require("../services/depositService");
const paymentService = require("../services/payment/paymentService");
const supabase = require("../config/database");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const upload = multer(); // For parsing multipart/form-data from SendGrid

// Rate limiter for webhook endpoints (generous but protective)
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per window
  message: {
    error:
      "Too many webhook requests from this IP, please try again after 15 minutes",
  },
});

// ─── Provider Webhooks ────────────────────────────────────────

/**
 * POST /webhooks/paystack
 * Primary payment gateway webhook
 */
router.post("/paystack", webhookController.handlePaystack);

/**
 * POST /api/webhooks/grey
 * Direct Grey webhook (for future API support)
 */
router.post("/grey", webhookLimiter, webhookController.handleGrey);

/**
 * POST /webhooks/flutterwave
 * Flutterwave webhook (deprecated, routes to Fincra)
 */
router.post("/flutterwave", webhookController.handleFlutterwave);
router.get("/flutterwave", (req, res) =>
  res.status(200).send("Webhook endpoint only accepts POST requests")
);

/**
 * POST /webhooks/fincra
 * Fincra virtual account webhook
 */
router.post("/fincra", webhookController.handleFincra);

/**
 * POST /webhooks/nowpayments
 * POST /webhooks/crypto
 * Crypto payment webhooks
 */
router.post("/nowpayments", webhookController.handleNowPayments);
router.post("/crypto", webhookController.handleCrypto);

// ─── Admin Endpoints ──────────────────────────────────────────

/**
 * POST /webhooks/manual-confirm
 * Admin-only: Manually confirm a Grey/manual payment
 */
router.post("/manual-confirm", async (req, res) => {
  const { reference, externalHash } = req.body;

  if (!reference) {
    return res.status(400).json({ error: "Reference is required" });
  }

  // Require admin key in production
  const adminKey = req.headers["x-admin-key"];
  if (
    process.env.NODE_ENV === "production" &&
    adminKey !== process.env.ADMIN_SECRET_KEY
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Record audit log
    try {
      await supabase.from("payment_audit_logs").insert({
        admin_id: req.user?.id || "00000000-0000-0000-0000-000000000000",
        payment_reference: reference,
        action: "MANUAL_CONFIRM",
        previous_status: "pending",
        new_status: "success",
        reason: req.body.reason || "Admin manual confirmation",
        metadata: {
          ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
          externalHash,
        },
      });
    } catch (auditErr) {
      // Non-critical - don't block the confirmation
      console.error("[Webhook] Audit log failed:", auditErr.message);
    }

    const result = await depositService.confirmDeposit(reference, externalHash);
    res.json(result);
  } catch (err) {
    console.error("[Webhook] Manual confirm error:", err);
    res.status(400).json({ error: err.message });
  }
});

// ─── Status Check ─────────────────────────────────────────────

/**
 * GET /webhooks/status/:reference
 * Check payment/deposit status (used for frontend polling)
 */
router.get("/status/:reference", async (req, res) => {
  const { reference } = req.params;

  try {
    const { transaction_id } = req.query;
    const status = await paymentService.verifyPaymentStatus(
      reference,
      transaction_id
    );

    if (!status) {
      return res.status(404).json({ error: "Deposit not found" });
    }

    res.json(status);
  } catch (err) {
    console.error("[Webhook] Status check error:", err);
    res.status(500).json({ error: "Failed to check status" });
  }
});

module.exports = router;
