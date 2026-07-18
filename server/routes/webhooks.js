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
const paymentService = require("../services/payment/paymentService");

const supabase = require("../config/database");
const logger = require("../utils/logger");
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

const WebhookService = require("../services/WebhookService");

// ─── Provider Webhooks ────────────────────────────────────────

/**
 * POST /webhooks/paystack
 * Primary payment gateway webhook
 */
router.post("/paystack", WebhookService.processPaystackWebhook.bind(WebhookService));

/**
 * POST /api/webhooks/grey
 * Direct Grey webhook (for future API support)
 */
router.post("/grey", webhookLimiter, (req, res) => res.status(200).json({ received: true, status: "disabled" }));

/**
 * POST /webhooks/flutterwave
 * Flutterwave webhook (deprecated, routes to Fincra)
 */
router.post("/flutterwave", (req, res) => res.status(200).json({ received: true, status: "disabled" }));
router.get("/flutterwave", (req, res) =>
  res.status(200).send("Webhook endpoint only accepts POST requests")
);

/**
 * POST /webhooks/fincra
 * Fincra virtual account webhook
 */
router.post("/fincra", (req, res) => res.status(200).json({ received: true, status: "disabled" }));

/**
 * POST /webhooks/nowpayments
 * POST /webhooks/crypto
 * Crypto payment webhooks
 */
router.post("/nowpayments", WebhookService.processNowPaymentsWebhook.bind(WebhookService));
router.post("/crypto", (req, res) => res.status(200).json({ received: true, status: "not_implemented" }));

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
      console.error("[Webhook] Audit log failed:", auditErr.message);
    }

    const { data: tx } = await supabase.from('transactions').select('*').eq('reference_id', reference).single();
    if (!tx) throw new Error("Transaction not found");

    const WebhookService = require('../services/WebhookService');
    const result = await WebhookService.processPaystackEvent({
        event: 'charge.success',
        data: { reference: reference, amount: tx.amount, currency: tx.currency }
    });
    
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

    // ── Task 4.e: O(1) Webhook Status Bridge ──────────────────────
    // Resolve directly from DB. NEVER block on External Providers or FX here.
    let query = supabase.from("transactions").select("id, status, amount, currency, provider, reference_id");
    
    // Build a safe OR filter
    const filters = [
      `reference_id.eq.${reference}`,
      `provider_reference.eq.${reference}`
    ];
    if (transaction_id && transaction_id !== 'undefined') {
      filters.push(`id.eq.${transaction_id}`);
    }

    const { data: tx, error } = await query
      .or(filters.join(","))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !tx) {
      if (error) logger.error(`[WebhookStatus] DB Error: ${error.message}`);
      return res.status(404).json({ error: "Deposit not found" });
    }

    // Proactively verify pending paystack transactions in case webhook was missed
    if (tx.status === "PENDING" && tx.provider === "paystack") {
      try {
        const PaystackProvider = require("../services/payment/providers/PaystackProvider");
        const provider = new PaystackProvider();
        const verifyResult = await provider.verifyPayment(tx.reference_id);
        
        if (verifyResult.status === "success") {
          // Trigger webhook processing manually
          const WebhookService = require("../services/WebhookService");
          // Fake a request object to reuse the webhook logic
          const fakeReq = {
            headers: { "x-forwarded-for": req.ip || "127.0.0.1", "user-agent": req.headers["user-agent"] },
            socket: req.socket,
            body: {
              event: "charge.success",
              data: {
                reference: tx.reference_id,
                amount: verifyResult.amount * 100, // Paystack amount is in kobo
                currency: verifyResult.currency,
                status: "success",
                customer: verifyResult.customer,
                id: "manual_poll_" + Date.now()
              }
            }
          };
          
          // Since verifySignature is checked in processPaystackWebhook, we bypass it by overriding verifySignature for this call
          const originalVerify = WebhookService.verifySignature;
          WebhookService.verifySignature = () => true;
          
          // Fake response
          const fakeRes = {
            status: () => ({ send: () => {} })
          };
          
          await WebhookService.processPaystackWebhook(fakeReq, fakeRes);
          
          // Restore
          WebhookService.verifySignature = originalVerify;
          
          // Update local status for the response
          tx.status = "COMPLETED";
        }
      } catch (pollErr) {
        console.error("[WebhookStatus] Manual poll failed:", pollErr.message);
      }
    }

    res.json({
      success: tx.status === "SUCCESS" || tx.status === "COMPLETED",
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      provider: tx.provider,
      reference: tx.reference_id
    });
  } catch (err) {
    console.error("[Webhook] Status check error:", err);
    res.status(500).json({ error: "Failed to check status" });
  }
});

module.exports = router;
