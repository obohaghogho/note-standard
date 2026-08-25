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
 * Handles BOTH payouts (withdrawals) AND deposits (collections/incoming transfers).
 */
router.post("/grey", webhookLimiter, async (req, res) => {
  try {
    const GreySettlementProvider = require('../services/settlement/GreySettlementProvider');
    const greyProvider = new GreySettlementProvider();

    const isValid = await greyProvider.verifyWebhookSignature(req.headers, req.body);
    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid signature or expired timestamp" });
    }

    const payload = req.body || {};
    const eventType = payload.event || payload.event_type || 'unknown';
    const eventTypeStr = String(eventType).toLowerCase().trim();

    logger.info(`[Grey Webhook] Received event: ${eventTypeStr}`);

    // ── PAYOUT EVENTS ────────────────────────────────────────────
    const PAYOUT_SUCCESS_EVENTS = [
      'transaction success', 'transaction_success', 'payout.completed',
      'payout.successful', 'transfer.success', 'success'
    ];
    const PAYOUT_FAILED_EVENTS = [
      'transaction failed', 'transaction_failed', 'payout.failed',
      'payout.rejected', 'transfer.failed', 'failed'
    ];

    if (PAYOUT_SUCCESS_EVENTS.includes(eventTypeStr)) {
      const WithdrawalWorkflowService = require('../services/treasury/WithdrawalWorkflowService');
      const reference = payload.reference || payload.data?.reference;
      const providerRef = payload.id || payload.data?.id;
      await WithdrawalWorkflowService.finalizeSuccessfulSettlement(reference, providerRef);
      return res.status(200).json({ success: true, message: "Grey payout webhook processed" });
    }

    if (PAYOUT_FAILED_EVENTS.includes(eventTypeStr)) {
      const WithdrawalWorkflowService = require('../services/treasury/WithdrawalWorkflowService');
      const reference = payload.reference || payload.data?.reference;
      const reason = payload.reason || payload.data?.reason || 'Provider payout failed';
      await WithdrawalWorkflowService.rollbackFailedWithdrawal(reference, reason, 'REJECTED');
      return res.status(200).json({ success: true, message: "Grey payout failure processed" });
    }

    // ── DEPOSIT / COLLECTION EVENTS ─────────────────────────────
    const DEPOSIT_EVENTS = [
      'transaction.received', 'deposit.completed', 'deposit.successful',
      'collection.successful', 'transfer.received', 'credit',
      'ach.received', 'wire.received', 'inbound_transfer.completed'
    ];

    if (DEPOSIT_EVENTS.includes(eventTypeStr)) {
      const result = await handleGreyDepositWebhook(payload);
      return res.status(200).json({ success: true, ...result });
    }

    // ── UNKNOWN EVENT — still return 200 to prevent retries ─────
    logger.info(`[Grey Webhook] Unhandled event type: ${eventTypeStr}. Acknowledged.`);
    return res.status(200).json({ success: true, message: "Grey webhook acknowledged (unhandled event type)" });

  } catch (err) {
    logger.error(`[Grey Webhook] Processing error: ${err.message}`, err);
    // Return 200 to prevent Grey from retrying on server errors
    return res.status(200).json({ success: false, error: err.message });
  }
});

/**
 * Handle Grey deposit/collection webhook.
 * Resolves user from memo/narration NS- reference, user_bank_references table,
 * or customerName profile match. Then credits wallet via DepositCreditEngine.
 */
async function handleGreyDepositWebhook(payload) {
  const data = payload.data || payload;
  const greyRef = data.reference || data.id || data.transaction_id;
  const amount = parseFloat(data.amount || data.source_amount || data.net_amount || 0);
  const currency = (data.currency || data.source_currency || 'USD').toUpperCase();
  const senderName = data.sender_name || data.customer_name || data.counterparty_name || data.narration || '';
  const memo = data.memo || data.narration || data.description || data.remark || '';
  const rail = (data.rail || data.type || data.channel || 'ACH').toUpperCase();

  logger.info(`[Grey Webhook/Deposit] Incoming: ${amount} ${currency} via ${rail} (ref: ${greyRef}, sender: ${senderName})`);

  if (!greyRef || !amount) {
    logger.warn("[Grey Webhook/Deposit] Missing required fields (ref/amount). Skipping.");
    return { handled: false, reason: "Missing required fields" };
  }

  // ── Idempotency: check if this Grey reference was already processed ────
  const { data: existingLog } = await supabase
    .from("transactions")
    .select("id, status, wallet_credit_status")
    .eq("provider_reference", greyRef)
    .eq("provider", "grey")
    .maybeSingle();

  if (existingLog && existingLog.wallet_credit_status === 'WALLET_CREDITED') {
    logger.info(`[Grey Webhook/Deposit] Already processed: ${greyRef}. Skipping.`);
    return { handled: true, reason: "Already processed" };
  }

  // ── User Resolution ─────────────────────────────────────────────────────
  let userId = null;

  // Strategy 1: Extract NS-XXXXXXX from memo/narration via progressive DB matching
  if (!userId) {
    const searchText = `${memo} ${senderName} ${data.description || ''}`;
    const nsRawMatch = searchText.match(/NS[-_ ]?([A-Z0-9]+)/i);
    if (nsRawMatch) {
      const rawCapture = nsRawMatch[1].toUpperCase();
      logger.info(`[Grey Webhook/Deposit] Raw NS capture: ${rawCapture}`);

      for (let len = Math.min(rawCapture.length, 8); len >= 5 && !userId; len--) {
        const candidateRef = `NS-${rawCapture.substring(0, len)}`;

        // Check transactions table
        const { data: txMatch } = await supabase
          .from("transactions")
          .select("user_id")
          .or(`reference_id.eq.${candidateRef},metadata->>display_ref.eq.${candidateRef}`)
          .maybeSingle();

        if (txMatch) {
          userId = txMatch.user_id;
          logger.info(`[Grey Webhook/Deposit] Resolved user ${userId} via narration ref (${candidateRef}).`);
          break;
        }

        // Check user_bank_references table
        const { data: refMatch } = await supabase
          .from("user_bank_references")
          .select("user_id")
          .eq("reference", candidateRef)
          .eq("is_active", true)
          .maybeSingle();

        if (refMatch) {
          userId = refMatch.user_id;
          logger.info(`[Grey Webhook/Deposit] Resolved user ${userId} via bank reference (${candidateRef}).`);
          break;
        }

        // Check manual_deposits
        const { data: manualMatch } = await supabase
          .from("manual_deposits")
          .select("user_id")
          .eq("reference", candidateRef)
          .maybeSingle();
        if (manualMatch) {
          userId = manualMatch.user_id;
          logger.info(`[Grey Webhook/Deposit] Resolved user ${userId} via manual_deposits (${candidateRef}).`);
          break;
        }
      }
    }
  }

  // Strategy 2: Match by user_bank_references for Grey provider
  if (!userId && memo) {
    const { data: refMatch } = await supabase
      .from("user_bank_references")
      .select("user_id")
      .eq("provider", "grey")
      .eq("is_active", true)
      .ilike("reference", `%${memo.trim().substring(0, 20)}%`)
      .maybeSingle();
    if (refMatch) {
      userId = refMatch.user_id;
      logger.info(`[Grey Webhook/Deposit] Resolved user ${userId} via user_bank_references memo match.`);
    }
  }

  // Strategy 3: Match by sender name against profiles
  if (!userId && senderName) {
    const nameParts = senderName.trim().split(/\s+/).filter(p => p.length > 1);
    if (nameParts.length >= 2) {
      const sortedParts = nameParts.sort((a, b) => b.length - a.length).slice(0, 2);
      let query = supabase.from("profiles").select("id");
      for (const part of sortedParts) {
        query = query.ilike("full_name", `%${part}%`);
      }
      const { data: profileMatch } = await query.limit(1).maybeSingle();
      if (profileMatch) {
        userId = profileMatch.id;
        logger.info(`[Grey Webhook/Deposit] Resolved user ${userId} via sender name profile match (${senderName}).`);
      }
    }
  }

  // Strategy 4: Amount + currency match against PENDING deposits in recent window
  if (!userId && amount > 0) {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(); // 72h for ACH
    const { data: amountMatch } = await supabase
      .from("transactions")
      .select("user_id, id, reference_id")
      .eq("type", "DEPOSIT")
      .eq("currency", currency)
      .eq("amount", amount)
      .in("status", ["PENDING", "PROCESSING"])
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (amountMatch) {
      userId = amountMatch.user_id;
      logger.info(`[Grey Webhook/Deposit] Resolved user ${userId} via amount+currency match (${amount} ${currency}).`);
    }
  }

  if (!userId) {
    logger.warn(`[Grey Webhook/Deposit] Could not resolve user for deposit ${greyRef} (${amount} ${currency}). Sender: ${senderName}, Memo: ${memo}`);
    return { handled: false, reason: `Could not resolve user. Sender: ${senderName}, Memo: ${memo}` };
  }

  // ── Get or create wallet ────────────────────────────────────────────
  let { data: wallet } = await supabase
    .from("wallets_v6")
    .select("id, balance, available_balance")
    .eq("user_id", userId)
    .eq("currency", currency)
    .maybeSingle();

  if (!wallet) {
    logger.info(`[Grey Webhook/Deposit] No ${currency} wallet for user ${userId}. Auto-creating...`);
    try {
      const walletService = require("../services/walletService");
      wallet = await walletService.createWallet(userId, currency, 'native');
    } catch {
      const { data: insertedWallet } = await supabase
        .from("wallets_v6")
        .insert({ user_id: userId, currency, balance: 0, available_balance: 0, pending_balance: 0 })
        .select("id, balance, available_balance")
        .single();
      wallet = insertedWallet;
    }
  }

  if (!wallet) {
    logger.error(`[Grey Webhook/Deposit] Wallet creation failed for user ${userId} (${currency}).`);
    return { handled: false, reason: "Wallet not found" };
  }

  // ── Create or find transaction ──────────────────────────────────────
  let { data: primaryTx } = await supabase
    .from("transactions")
    .select("id, reference_id, wallet_credit_status")
    .or(`provider_reference.eq.${greyRef}`)
    .maybeSingle();

  if (!primaryTx) {
    const { data: newTx } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        amount,
        currency,
        type: "DEPOSIT",
        status: "PENDING",
        reference_id: `GREY-DEP-${greyRef}`,
        provider_reference: greyRef,
        provider: "grey",
        payment_status: "PAYMENT_CONFIRMED",
        wallet_credit_status: "WALLET_CREDIT_PENDING",
        display_label: `${currency} ${rail} Deposit`,
        metadata: {
          provider: "grey",
          channel: rail,
          sender_name: senderName,
          memo,
          payload: data
        }
      })
      .select("id, reference_id")
      .single();
    primaryTx = newTx;
  }

  // ── Credit via DepositCreditEngine ──────────────────────────────────
  const DepositCreditEngine = require("../services/payment/DepositCreditEngine");
  let creditRes = null;
  try {
    creditRes = await DepositCreditEngine.credit({
      transactionId: primaryTx?.id || null,
      reference: primaryTx?.reference_id || `GREY-DEP-${greyRef}`,
      amount,
      currency,
      userId,
      providerTxId: greyRef,
      source: "GREY_WEBHOOK",
    });
    logger.info(`[Grey Webhook/Deposit] ✅ Credited ${amount} ${currency} to user ${userId}. Result: ${JSON.stringify(creditRes)}`);
  } catch (creditErr) {
    logger.error(`[Grey Webhook/Deposit] DepositCreditEngine error: ${creditErr.message}`);
  }

  return { handled: true, status: 'SUCCESSFUL', amount, currency, userId, creditRes };
}

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
