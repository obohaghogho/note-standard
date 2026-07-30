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

// ── Safe proactive-credit helper
// Uses an idempotency key so concurrent polls never double-credit a wallet.
// This replaces the previous dangerous singleton monkey-patch pattern:
//   WebhookService.verifySignature = () => true  ← race condition
async function safeProactiveCredit(tx) {
  const FiatWalletService = require("../services/FiatWalletService");
  const AuditLogService   = require("../services/AuditLogService");
  const idempotencyKey = `paystack_proactive_${tx.reference_id}_${tx.id}`;

  const ledgerTxId = await FiatWalletService.fundWallet(
    tx.user_id,
    tx.currency,
    tx.amount,
    idempotencyKey,
    { provider: "paystack", reference: tx.reference_id, proactive: true }
  );

  await supabase
    .from("transactions")
    .update({ status: "COMPLETED", updated_at: new Date().toISOString() })
    .eq("id", tx.id);

  AuditLogService.log({
    user_id:   tx.user_id,
    action:    "fiat_deposit_proactive_verify",
    provider:  "paystack",
    reference: tx.reference_id,
    amount:    tx.amount,
    currency:  tx.currency,
    ledger_id: ledgerTxId
  }).catch(err => logger.warn("[safeProactiveCredit] Audit log failed:", err.message));

  return ledgerTxId;
}

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
 * Fincra webhook endpoint
 */
router.post("/fincra", (req, res, next) => require("./fincraWebhook")(req, res, next));

/**
 * POST /webhooks/nowpayments
 * POST /api/payments/nowpayments/ipn
 * Crypto payment webhooks
 */
router.post("/nowpayments", WebhookService.processNowPaymentsWebhook.bind(WebhookService));
router.post("/nowpayments/ipn", WebhookService.processNowPaymentsWebhook.bind(WebhookService));
router.post("/ipn", WebhookService.processNowPaymentsWebhook.bind(WebhookService));
router.post("/crypto", (req, res) => res.status(200).json({ received: true, status: "not_implemented" }));

/**
 * POST /webhooks/anchor
 * Anchor BaaS virtual account & payout webhooks
 */
router.post("/anchor", async (req, res) => {
  try {
    const AnchorProvider = require("../services/payment/providers/AnchorProvider");
    const FiatWalletService = require("../services/FiatWalletService");
    const AuditLogService = require("../services/AuditLogService");

    const provider = new AnchorProvider();

    // Always ACK immediately — Anchor retries on non-200
    res.status(200).json({ received: true });

    // Verify signature
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isValid = provider.verifyWebhookSignature(req.headers, req.body, rawBody);
    if (!isValid) {
      logger.warn("[AnchorWebhook] Invalid signature — payload ignored");
      return;
    }

    const parsed = provider.parseWebhookEvent(req.body);
    logger.info(`[AnchorWebhook] Event received: type=${parsed.type} status=${parsed.status} ref=${parsed.reference}`);

    if (parsed.type === "DEPOSIT" && parsed.status === "success" && parsed.reference) {
      // Find transaction by reference
      const { data: tx } = await supabase
        .from("transactions")
        .select("*")
        .eq("reference_id", parsed.reference)
        .maybeSingle();

      if (tx && ["PENDING", "FAILED"].includes(tx.status)) {
        const idempotencyKey = `anchor_webhook_${parsed.reference}_${tx.id}`;
        await FiatWalletService.fundWallet(
          tx.user_id,
          parsed.currency,
          parsed.amount,
          idempotencyKey,
          { provider: "anchor", reference: parsed.reference }
        );
        await supabase
          .from("transactions")
          .update({ status: "COMPLETED", updated_at: new Date().toISOString() })
          .eq("id", tx.id);

        AuditLogService.log({
          user_id: tx.user_id,
          action: "anchor_deposit_webhook",
          provider: "anchor",
          reference: parsed.reference,
          amount: parsed.amount,
          currency: parsed.currency,
        }).catch((err) => logger.warn("[AnchorWebhook] Audit log failed:", err.message));
      }
    }
  } catch (err) {
    logger.error(`[AnchorWebhook] Handler error: ${err.message}`);
    // Response already sent — no further action
  }
});

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
    let query = supabase.from("transactions").select("id, status, amount, currency, provider, reference_id, user_id");
    
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

    // Proactively verify pending/failed transactions with paymentService for all providers (Fincra, Paystack, etc.)
    if (["PENDING", "FAILED"].includes(tx.status)) {
      try {
        const paymentService = require("../services/payment/paymentService");
        const verifyResult = await paymentService.verifyPaymentStatus(tx.reference_id || reference);
        if (verifyResult.status === "COMPLETED" || verifyResult.status === "SUCCESS") {
          tx.status = "COMPLETED";
        }
      } catch (pollErr) {
        logger.error(`[WebhookStatus] Proactive verify failed for ${reference}: ${pollErr.message}`);
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
