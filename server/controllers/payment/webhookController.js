const PaymentFactory = require("../../services/payment/PaymentFactory");
const logger = require("../../utils/logger");
const WebhookSignatureService = require("../../services/payment/WebhookSignatureService");
const { paymentQueue } = require("../../services/payment/paymentQueue");
const supabase = require("../../config/database");
const GreyEmailService = require("../../services/payment/GreyEmailService");

/**
 * Unified Webhook Controller
 *
 * Routes webhook requests to the correct provider handler.
 * Every handler follows these stability rules:
 * 1. Always return 200 OK to prevent provider retries
 * 2. Log first, process second
 * 3. Enforce idempotency
 * 4. Process asynchronously via queue when possible
 */

// ─── Paystack Webhook ─────────────────────────────────────────
exports.handlePaystack = async (req, res) => {
  const provider = PaymentFactory.getProviderByName("paystack");
  return provider.processWebhook(req, res);
};

// ─── Flutterwave (Legacy → Fincra) ───────────────────────────
exports.handleFlutterwave = async (req, res) => {
  logger.warn(
    "[Webhook] Received Flutterwave webhook on deprecated endpoint. Routing to Fincra handler."
  );
  const provider = PaymentFactory.getProviderByName("fincra");
  return provider.processWebhook(req, res);
};

// ─── Fincra ───────────────────────────────────────────────────
exports.handleFincra = async (req, res) => {
  const provider = PaymentFactory.getProviderByName("fincra");
  return provider.processWebhook(req, res);
};

// ─── Crypto (NowPayments) ────────────────────────────────────
exports.handleCrypto = async (req, res) => {
  const providerName = process.env.CRYPTO_PROVIDER || "crypto";
  const provider = PaymentFactory.getProviderByName(providerName);
  return provider.processWebhook(req, res);
};

exports.handleNowPayments = async (req, res) => {
  const provider = PaymentFactory.getProviderByName("nowpayments");
  return provider.processWebhook(req, res);
};

// ─── Grey Direct Webhook ──────────────────────────────────────
exports.handleGrey = async (req, res) => {
  try {
    const provider = PaymentFactory.getProviderByName("grey");

    // 1. Verify signature
    if (!provider.verifyWebhookSignature(req.headers, req.body)) {
      logger.warn("[Webhook] Unauthorized Grey attempt logged and dropped.");
      return res.status(200).json({ received: true, verified: false });
    }

    // 2. Parse event
    const event = provider.parseWebhookEvent(req.body);

    // 3. Log for audit
    const { data: log, error: logError } = await supabase
      .from("webhook_logs")
      .insert({
        provider: "grey",
        payload: req.body,
        headers: req.headers,
        reference: event.reference || "unknown",
        unique_transaction_id: event.transactionId || null,
        ip_address: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      })
      .select("id")
      .single();

    if (logError) {
      if (logError.code === "23505") {
        logger.warn(
          `[Webhook] Duplicate Grey transaction ${event.transactionId} dropped.`
        );
        return res.status(200).json({ received: true, duplicate: true });
      }
      logger.error("[Webhook] Failed to log Grey hit", {
        error: logError.message,
      });
    }

    // 4. Queue for async processing
    if (paymentQueue) {
      await paymentQueue.add("process-grey-webhook", {
        provider: "grey",
        event,
        payload: req.body,
        logId: log?.id,
      });
    } else {
      logger.warn("⚠️ Redis disabled: Skipping queue for grey webhook");
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error("[Webhook] Grey hit crash", { error: error.message });
    return res.status(200).json({ received: true, error: error.message });
  }
};

// ─── SendGrid Inbound Parse (Grey Email Notifications) ───────
/**
 * POST /api/payment/sendgrid-inbound
 *
 * Handles SendGrid Inbound Parse webhooks. These are forwarded emails
 * from Grey's notification system.
 */
exports.handleSendGridInbound = async (req, res) => {
  // Always respond 200 immediately to prevent SendGrid retries
  res.status(200).json({ received: true });

  try {
    logger.info("[Webhook] SendGrid Inbound Parse received");

    // 1. Verify authenticity
    if (!WebhookSignatureService.verifySendGrid(req.headers, req.body, req.query)) {
      const ip =
        req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
      logger.warn("[Webhook] Unauthorized SendGrid attempt from IP:", ip);

      await supabase.from("webhook_logs").insert({
        provider: "sendgrid",
        payload: { note: "Unauthorized attempt", ip },
        headers: req.headers,
        reference: "unauthorized",
        processing_error: "Invalid signature/secret",
        ip_address: ip,
      }).catch(() => {});

      return;
    }

    // 2. Parse the SendGrid inbound email payload
    const parsed = GreyEmailService.parseSendGridPayload(req.body);

    logger.info("[Webhook] SendGrid email parsed:", {
      amount: parsed.amount,
      currency: parsed.currency,
      reference: parsed.reference,
      sender: parsed.sender,
      confidence: parsed.confidence,
    });

    // 3. Generate idempotency key
    const idempotencyKey =
      parsed.transactionId ||
      `sendgrid_${Date.now()}_${parsed.reference || "unknown"}`;

    // 4. Log the webhook hit
    const { data: log, error: logError } = await supabase
      .from("webhook_logs")
      .insert({
        provider: "sendgrid",
        payload: req.body,
        headers: req.headers,
        reference: parsed.reference || "unknown",
        unique_transaction_id: idempotencyKey,
        ip_address: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      })
      .select("id")
      .single();

    if (logError) {
      if (logError.code === "23505") {
        logger.warn(
          `[Webhook] Duplicate SendGrid email ${idempotencyKey} dropped.`
        );
        return;
      }
      logger.error("[Webhook] Failed to log SendGrid hit", {
        error: logError.message,
      });
    }

    // 5. Build unified event structure
    const event = {
      type: "deposit",
      reference: parsed.reference,
      status: parsed.status === "completed" ? "success" : "needs_review",
      amount: parsed.amount,
      currency: parsed.currency,
      sender: parsed.sender,
      transactionId: idempotencyKey,
      confidence: parsed.confidence,
      raw: parsed.raw,
    };

    // 6. Queue for processing
    if (paymentQueue) {
      await paymentQueue.add(
        parsed.confidence >= 60
          ? "process-sendgrid-webhook"
          : "process-sendgrid-unmatched",
        {
          provider: "grey",
          event,
          payload: parsed,
          logId: log?.id,
        }
      );
      logger.info(
        `[Webhook] SendGrid email queued (confidence: ${parsed.confidence}%)`
      );
    } else {
      logger.warn("⚠️ Redis disabled: Skipping queue for SendGrid webhook");
    }
  } catch (error) {
    logger.error("[Webhook] SendGrid processing crash:", {
      error: error.message,
      stack: error.stack,
    });
  }
};

