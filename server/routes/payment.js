const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment/paymentController");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { transactionLimiter } = require("../middleware/rateLimiter");

/**
 * Payment Routes
 * /api/payment
 *
 * Unified payment endpoints for both Paystack and Grey flows.
 */

const multer = require("multer");
const upload = multer();
const webhookController = require("../controllers/payment/webhookController");

// ─── Initialize Payment ──────────────────────────────────────
// Creates a payment record and returns either:
// - Paystack checkout URL (for card payments)
// - Grey bank details + reference (for bank transfers)
router.post(
  "/initialize",
  requireAuth,
  transactionLimiter,
  paymentController.initialize
);

// ─── SendGrid Inbound Parse (Grey Payment Emails) ────────────
// Receives parsed email data from SendGrid Inbound Parse
router.post(
  "/sendgrid-inbound",
  upload.none(),
  webhookController.handleSendGridInbound
);

// ─── Verify Paystack Payment ─────────────────────────────────
// Frontend calls this after Paystack checkout redirect
// Checks with Paystack API to confirm payment
router.post("/verify-paystack", requireAuth, paymentController.verifyPaystack);

// ─── Verify Grey Payment ────────────────────────────────────
// Frontend polls this to check if Grey bank transfer was detected
// Returns current status (pending/success/expired)
router.post("/verify-grey", requireAuth, paymentController.verifyGrey);

// ─── Check Payment Status ────────────────────────────────────
// Generic status check by reference (works for any provider)
router.get("/status/:reference", requireAuth, paymentController.checkStatus);

// ─── Failsafe Verification ───────────────────────────────────
// Manual fallback trigger for Paystack verification
router.post("/verify/:reference", requireAuth, paymentController.verifyPaystack);

// ─── Manual Payment Instructions ─────────────────────────────
// Returns Grey bank account details for a given currency
router.get(
  "/instructions/:currency",
  requireAuth,
  paymentController.getInstructions
);

// ─── Admin: Manual Confirm ───────────────────────────────────
// Manually confirm a Grey payment (fallback when auto-parsing fails)
router.post("/manual-confirm", requireAdmin, paymentController.manualConfirm);

module.exports = router;
