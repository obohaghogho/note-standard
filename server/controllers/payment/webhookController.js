const PaymentFactory = require("../../services/payment/PaymentFactory");
const logger = require("../../utils/logger");
const WebhookSignatureService = require("../../services/payment/WebhookSignatureService");
const { paymentQueue } = require("../../services/payment/paymentQueue");
const supabase = require("../../config/database");
const UniversalParserEngine = require("../../services/payment/UniversalParserEngine");
const paymentService = require("../../services/payment/paymentService");
const crypto = require("crypto");

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

    // 1. Check Global System Mode (Safe Mode Kill Switch)
    const { data: settings } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "SYSTEM_MODE")
      .single();
    
    if (settings?.value?.mode === 'SAFE') {
      logger.error(`[Webhook] BLOCKED: System is in SAFE MODE. No payment ingestion permitted.`);
      return res.status(503).json({ error: "System is in maintenance/protection mode." });
    }

    // 2. Initialize Parsing
    const parsed = UniversalParserEngine.parseSendGridPayload(req.body);
    
    // Evaluate Fraud Score Early
    const FraudEngine = require("../../services/payment/FraudEngine");
    const fraudResult = await FraudEngine.evaluateTransaction(parsed);
    
    // Global Fraud Block - Hard Gate
    if (fraudResult.action === 'block') {
       logger.warn(`[Webhook] Critical Fraud Blocked: ${parsed.sender_fingerprint} (Score: ${fraudResult.score})`);
       return res.status(403).json({ success: false, reason: "security_block" });
    }

    logger.info(`[Webhook] SendGrid email received:`, {
      amount: parsed.normalized_amount,
      currency: parsed.normalized_currency,
      reference: parsed.normalized_reference,
      sender: parsed.sender_fingerprint,
      confidence: parsed.confidence_score,
      fraud_score: fraudResult.score,
      region: parsed.provider_region
    });

    // 3. Generate strict DUAL idempotency hashes
    const payloadString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const payloadHash = crypto.createHash("sha256").update(payloadString).digest("hex");
    const transactionId = parsed.transactionId || null;
    
    // Business Idempotency: Protects against functionally identical emails even if raw data differs slightly
    const reqAmount = parsed.normalized_amount || 0;
    const reqRef = parsed.normalized_reference || 'NOREFERENCE';
    const businessHashInput = `${reqRef}:${reqAmount}:${parsed.normalized_currency}:${parsed.sender_fingerprint}`;
    const businessHash = crypto.createHash("sha256").update(businessHashInput).digest("hex");

    // 3.b Timestamp Window Enforcement (Replay Protection)
    // Assume headers.date or headers.timestamp exists, otherwise we default loosely
    const webhookTs = req.headers['date'] || req.headers['x-timestamp'] || null;
    let webhookDate = Date.now();
    if (webhookTs) {
        webhookDate = new Date(webhookTs).getTime();
        const now = Date.now();
        if ((now - webhookDate) > 24 * 60 * 60 * 1000) {
            logger.warn(`[Webhook] Stale webhook rejected (older than 24 hours): ${webhookTs}`);
            return;
        }
    }

    // 3.c Triple-ID Identity Model (fingerprint_hash)
    // SHA256(sender + amount + currency + TRUNCATE_DAY(timestamp))
    const truncateDayTs = new Date(webhookDate).toISOString().split('T')[0];
    const fingerprintString = `${parsed.sender_fingerprint}:${reqAmount}:${parsed.normalized_currency}:${truncateDayTs}`;
    const fingerprintHash = crypto.createHash("sha256").update(fingerputString).digest("hex");

    // 4. IDEMPOTENCY LAYER: Check webhook_events table
    // If external_id, payload_hash, business_hash, or fingerprint_hash exists, it throws 23505
    const { data: eventLog, error: eventErr } = await supabase
      .from("webhook_events")
      .insert({
        provider: "universal_email",
        external_id: transactionId,
        payload_hash: payloadHash,
        business_hash: businessHash,
        fingerprint_hash: fingerprintHash,
        status: "processing"
      })
      .select("id")
      .single();

    if (eventErr && eventErr.code === "23505") {
      logger.warn(`[Webhook] Duplicate SendGrid email dropped (Triple-ID / Dual Idempotency Triggered).`);
      return;
    }

    // 5. Build unified event structure for the downstream pipeline
    const event = {
      type: "deposit",
      reference: parsed.normalized_reference,
      status: parsed.confidence_score >= 85 ? "success" : "needs_review",
      amount: parsed.normalized_amount,
      currency: parsed.normalized_currency,
      sender: parsed.sender_fingerprint,
      transactionId: transactionId || payloadHash,
      confidence: parsed.confidence_score,
      region: parsed.provider_region,
      raw: parsed.raw,
      webhook_event_id: eventLog.id // Pass ID so success overrides it
    };

    // 6. STRICT DECISION ENGINE ROUTING (Approved Final Form thresholds)
    if (parsed.confidence_score < 40) {
        // Tier 4: FAILED_PARSE_QUEUE
        logger.warn(`[Webhook] FAILED_PARSE (<40). Rerouted.`);
        await supabase.from("reconciliation_queue").insert({
            raw_payload: req.body,
            parsed_data: { ...parsed, fraudScore: fraudResult.score },
            reason: "parsing_failed",
            queue_type: "failed_parse",
            status: "pending"
        });
        
        // Notify User of potential signal
        const paymentService = require("../../services/payment/paymentService");
        await paymentService.notifyPotentialPayment(parsed.sender_fingerprint, "failed_parse");
        
        await supabase.from("webhook_events").update({ status: "skipped", error_message: "Low confidence parse" }).eq("id", eventLog.id);
        return;
    } else if (parsed.confidence_score >= 40 && parsed.confidence_score < 60) {
        // Tier 3: AMBIGUOUS_MATCH_QUEUE
        logger.warn(`[Webhook] AMBIGUOUS_MATCH (40-59). Rerouted.`);
        await supabase.from("reconciliation_queue").insert({
            payment_reference: parsed.normalized_reference,
            raw_payload: req.body,
            parsed_data: { ...parsed, fraudScore: fraudResult.score },
            reason: "ambiguous_match",
            queue_type: "ambiguous_match",
            status: "pending"
        });

        // Notify User of potential signal
        const paymentService = require("../../services/payment/paymentService");
        await paymentService.notifyPotentialPayment(parsed.sender_fingerprint, "ambiguous_match");

        await supabase.from("webhook_events").update({ status: "skipped", error_message: "Ambiguous match" }).eq("id", eventLog.id);
        return;
    } else if ((parsed.confidence_score >= 60 && parsed.confidence_score < 85) || fraudResult.action === 'review') {
        // Tier 2: PENDING_CONFIRMATION (Reasonable but needs secondary check)
        logger.info(`[Webhook] PENDING_CONFIRMATION (60-84 or Fraud Review). Rerouted.`);
        await supabase.from("reconciliation_queue").insert({
            payment_reference: parsed.normalized_reference,
            raw_payload: req.body,
            parsed_data: { ...parsed, fraudScore: fraudResult.score },
            reason: fraudResult.action === 'review' ? "fraud_review" : "pending_confirmation",
            queue_type: "pending_confirmation",
            status: "pending"
        });
        await supabase.from("webhook_events").update({ status: "skipped", error_message: "Pending Confirmation" }).eq("id", eventLog.id);
        return;
    }
    
    // Tier 1: MATCHED (Confidence >= 85 AND Fraud Allow)
    logger.info(`[Webhook] MATCHED (Confidence: ${parsed.confidence_score}%). Proceeding to Layer 3.`);

    // 7. Auto-Approve Pipeline (>=85 Confidence)
    if (paymentQueue && paymentQueue.add) {
      await paymentQueue.add("process-sendgrid-webhook", {
          provider: "grey",
          event,
          payload: parsed,
          logId: eventLog.id,
      });
      logger.info(`[Webhook] SendGrid email queued (confidence: ${parsed.confidence_score}%)`);
    } else {
      logger.info("[Webhook] Redis disabled: Falling back to synchronous processing");
      
      try {
        const result = await paymentService.executeWebhookAction(event, parsed, "grey");
        
        if (result && result.error) {
           await supabase.from("webhook_events").update({ status: "failed", error_message: result.error }).eq("id", eventLog.id);
        } else {
           await supabase.from("webhook_events").update({ status: "success" }).eq("id", eventLog.id);
        }
      } catch (syncErr) {
        logger.error("[Webhook] Sync processing failed", { error: syncErr.message });
        await supabase.from("webhook_events").update({ status: "failed", error_message: syncErr.message }).eq("id", eventLog.id);
      }
    }
  } catch (error) {
    logger.error("[Webhook] SendGrid processing crash:", {
      error: error.message,
      stack: error.stack,
    });
  }
};

