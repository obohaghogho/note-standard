/**
 * Webhook Routes
 * Handles Paystack webhooks
 */

const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/payment/webhookController");
const depositService = require("../services/depositService");
const paymentService = require("../services/payment/paymentService");
const supabase = require("../config/supabase");

/**
 * Legacy/Existing Paystack Webhook (Refactored to use controller or kept for compatibility)
 */
router.post("/paystack", webhookController.handlePaystack);

/**
 * Flutterwave Webhook
 */
router.post("/flutterwave", webhookController.handleFlutterwave);

/**
 * Korapay Webhook
 */
router.post("/korapay", webhookController.handleKorapay);

/**
 * Crypto Webhook (NowPayments)
 */
router.post("/nowpayments", webhookController.handleNowPayments);
router.post("/crypto", webhookController.handleCrypto);

/**
 * POST /webhooks/manual-confirm
 * Manual confirmation endpoint for testing/admin use
 */
router.post("/manual-confirm", async (req, res) => {
  const { reference, externalHash } = req.body;

  if (!reference) {
    return res.status(400).json({ error: "Reference is required" });
  }

  const adminKey = req.headers["x-admin-key"];
  if (
    process.env.NODE_ENV === "production" &&
    adminKey !== process.env.ADMIN_SECRET_KEY
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await depositService.confirmDeposit(reference, externalHash);
    res.json(result);
  } catch (err) {
    console.error("[Webhook] Manual confirm error:", err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /webhooks/status/:reference
 * Check deposit status
 */
router.get("/status/:reference", async (req, res) => {
  const { reference } = req.params;

  try {
    // Proactively verify with provider if pending
    const status = await paymentService.verifyPaymentStatus(reference);

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
