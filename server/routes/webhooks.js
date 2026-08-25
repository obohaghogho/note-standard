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

// REMOVED: safeProactiveCredit helper — replaced by DepositCreditEngine
// All proactive credit attempts now go through the unified engine.

// ─── Provider Webhooks ────────────────────────────────────────

/**
 * POST /webhooks/paystack
 * Primary payment gateway webhook
 */
router.post("/paystack", WebhookService.processPaystackWebhook.bind(WebhookService));

/**
 * POST /webhooks/grey
 * Direct Grey Settlement Webhook Handler
 */
router.post("/grey", webhookLimiter, async (req, res) => {
  try {
    const GreySettlementProvider = require('../services/settlement/GreySettlementProvider');
    const WithdrawalWorkflowService = require('../services/treasury/WithdrawalWorkflowService');
    const greyProvider = new GreySettlementProvider();

    const isValid = await greyProvider.verifyWebhookSignature(req.headers, req.body);
    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid signature or expired timestamp" });
    }

    const payload = req.body || {};
    const eventType = payload.event || payload.event_type || 'payout.completed';
    const reference = payload.reference || payload.data?.reference;
    const providerRef = payload.id || payload.data?.id;

    const eventTypeStr = String(eventType).toLowerCase().trim();

    if (['transaction success', 'transaction_success', 'payout.completed', 'payout.successful', 'transfer.success', 'success'].includes(eventTypeStr)) {
      await WithdrawalWorkflowService.finalizeSuccessfulSettlement(reference, providerRef);
    } else if (['transaction failed', 'transaction_failed', 'payout.failed', 'payout.rejected', 'transfer.failed', 'failed'].includes(eventTypeStr)) {
      const reason = payload.reason || payload.data?.reason || 'Provider payout failed';
      await WithdrawalWorkflowService.rollbackFailedWithdrawal(reference, reason, 'REJECTED');
    }

    return res.status(200).json({ success: true, message: "Grey webhook processed successfully" });
  } catch (err) {
    logger.error(`[Grey Webhook] Processing error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

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
    const DepositCreditEngine = require("../services/payment/DepositCreditEngine");

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
      // Credit via the unified DepositCreditEngine
      const creditResult = await DepositCreditEngine.credit({
        reference:    parsed.reference,
        amount:       parsed.amount,
        currency:     parsed.currency,
        providerTxId: parsed.transactionId,
        source:       'ANCHOR_WEBHOOK',
      });

      if (creditResult.error) {
        logger.error(`[AnchorWebhook] DepositCreditEngine error: ${creditResult.error}`);
      } else if (creditResult.credited) {
        logger.info(`[AnchorWebhook] ✅ Wallet credited via DepositCreditEngine. Ref: ${parsed.reference}`);
      } else if (creditResult.alreadyCredited) {
        logger.info(`[AnchorWebhook] Idempotency hit. Ref: ${parsed.reference}`);
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

    // Proactively verify pending/failed transactions via the unified DepositCreditEngine
    // NOTE: Previously this called paymentService.verifyPaymentStatus which had a side-effect
    // of triggering finalizeTransaction → confirm_deposit. This created a shadow credit path
    // from a GET endpoint. Now we use the authoritative engine.
    if (["PENDING", "FAILED"].includes(tx.status)) {
      try {
        const DepositCreditEngine = require("../services/payment/DepositCreditEngine");
        const creditResult = await DepositCreditEngine.credit({
          transactionId: tx.id,
          reference:     tx.reference_id || reference,
          source:        'STATUS_POLL_PROACTIVE',
        });
        if (creditResult.credited || creditResult.alreadyCredited) {
          tx.status = "COMPLETED";
        }
      } catch (pollErr) {
        logger.error(`[WebhookStatus] Proactive credit failed for ${reference}: ${pollErr.message}`);
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
